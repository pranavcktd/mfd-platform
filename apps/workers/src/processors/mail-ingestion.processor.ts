import { Job } from "bullmq";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@mfd/db";
import { identifyRtaSender, extractDownloadLink } from "../mail-link-extraction";
import { archiveDecryptionQueue } from "../queues/queue-producers";

export type MailIngestionJobData = Record<string, never>;

function requireImapConfig() {
  const user = process.env.BACKEND_GMAIL_ADDRESS;
  const pass = process.env.BACKEND_GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("BACKEND_GMAIL_ADDRESS / BACKEND_GMAIL_APP_PASSWORD are not configured");
  }
  return { user, pass };
}

/**
 * Tries to identify which onboarded ArnProfile this email was originally
 * addressed to, by matching the parsed "To" header (which auto-forwarding
 * typically leaves intact in the message source, unlike the IMAP envelope
 * recipient) against ArnProfile.camsMailId. UNCONFIRMED against a real
 * forwarded message — this is a best-effort hint, cross-checked downstream
 * against the ARN code embedded in the parsed report data, never trusted
 * alone (see tenant-resolution.ts).
 */
async function matchRecipientToDistributor(toAddresses: string[]): Promise<string | undefined> {
  if (toAddresses.length === 0) {
    return undefined;
  }
  const arnProfile = await prisma.arnProfile.findFirst({
    where: { camsMailId: { in: toAddresses.map((a) => a.toLowerCase()) } },
    select: { distributorId: true },
  });
  return arnProfile?.distributorId;
}

/**
 * Phase 1 / Step 2.2: one poll cycle against the shared backend inbox —
 * triggered on a schedule (see index.ts), not per-message. Connects via
 * IMAP, finds unread mail from either RTA's domain, extracts the secure
 * download link, and enqueues archive-decryption for each one found.
 * Marks processed messages \Seen so the next poll doesn't reprocess them;
 * the idempotency-hash mechanism in schema-mapping is a second layer of
 * duplicate protection if that ever fails (crash between enqueue and
 * marking \Seen, for example).
 *
 * UNTESTED against a real Gmail inbox — no BACKEND_GMAIL_APP_PASSWORD has
 * been provided yet. The IMAP query shape and header-matching logic follow
 * imapflow's documented API as closely as possible, but haven't been
 * exercised against live mail.
 */
export async function processMailIngestion(_job: Job<MailIngestionJobData>) {
  const { user, pass } = requireImapConfig();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let enqueued = 0;
  let skipped = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const message of client.fetch({ seen: false }, { source: true, envelope: true, uid: true })) {
        const fromAddress = message.envelope?.from?.[0]?.address ?? "";
        const rta = identifyRtaSender(fromAddress);
        if (!rta || !message.source) {
          skipped++;
          continue;
        }

        try {
          const parsed = await simpleParser(message.source);
          const bodyText = parsed.text ?? "";
          const bodyHtml = typeof parsed.html === "string" ? parsed.html : undefined;
          const downloadUrl = extractDownloadLink(rta, bodyText, bodyHtml);
          if (!downloadUrl) {
            skipped++;
            continue;
          }

          const toAddresses = (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
            .flatMap((addr) => addr.value.map((v) => v.address))
            .filter((a): a is string => Boolean(a));
          const expectedDistributorId = await matchRecipientToDistributor(toAddresses);

          await archiveDecryptionQueue().add("archive-decryption", { downloadUrl, rtaType: rta, expectedDistributorId });
          enqueued++;
        } finally {
          await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { enqueued, skipped };
}
