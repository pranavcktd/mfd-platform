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
async function matchRecipientToDistributor(
  toAddresses: string[],
): Promise<{ distributorId: string; arnProfileId: string } | undefined> {
  if (toAddresses.length === 0) {
    return undefined;
  }
  const arnProfile = await prisma.arnProfile.findFirst({
    where: { camsMailId: { in: toAddresses.map((a) => a.toLowerCase()) } },
    select: { id: true, distributorId: true },
  });
  return arnProfile ? { distributorId: arnProfile.distributorId, arnProfileId: arnProfile.id } : undefined;
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

  // ImapFlow emits socket/protocol failures as an 'error' event on itself
  // (a plain EventEmitter), not just as promise rejections. Node crashes the
  // whole process on an unhandled 'error' event with no listener attached —
  // confirmed live: a socket timeout mid-poll took down the entire workers
  // process (all 4 queues), not just this job. This listener converts it
  // into a normal caught error instead.
  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[mail-ingestion] IMAP client error:", err);
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Two-phase fetch. envelope-only is a lightweight, header-only IMAP
      // FETCH — safe to run over the whole unseen backlog every poll,
      // however large. Fetching {source: true} for every unseen message
      // up front (the original approach) pulls the full RFC822 body,
      // attachments included, for every message regardless of sender —
      // confirmed live against the real shared inbox (508 unseen messages
      // at the time, nearly all unrelated newsletters/notifications): that
      // approach reliably hit ImapFlow's socketTimeout (default 300s of
      // socket idle) partway through and killed the job. Non-RTA senders
      // are also intentionally left \Seen=false here (only the cheap
      // envelope scan touches them), so this stays safe to re-run on every
      // poll without the backlog compounding.
      const candidates: Array<{
        uid: number;
        rta: "CAMS" | "KFINTECH";
        fromAddress: string;
        subject?: string;
        receivedAt?: Date;
        messageId?: string;
      }> = [];
      for await (const message of client.fetch({ seen: false }, { envelope: true, uid: true })) {
        const fromAddress = message.envelope?.from?.[0]?.address ?? "";
        const rta = identifyRtaSender(fromAddress);
        if (!rta) {
          skipped++;
          continue;
        }
        candidates.push({
          uid: message.uid,
          rta,
          fromAddress,
          subject: message.envelope?.subject ?? undefined,
          receivedAt: message.envelope?.date ?? undefined,
          // Captured here (envelope-only, cheap) rather than only from the
          // later full-body parse, so it's present even on rows that fail
          // before body-parsing ever runs — see the MailIngestionLog.messageId
          // doc comment for why this exists (manual Gmail lookup on failure).
          messageId: message.envelope?.messageId ?? undefined,
        });
      }

      for (const candidate of candidates) {
        // One admin-visible log row per RTA email seen, regardless of
        // whether it turns out to carry a real report link — "no data"
        // mails and stray notifications from the same sender still show up
        // in the admin audit view rather than silently vanishing.
        const mailLog = await prisma.mailIngestionLog.create({
          data: {
            rtaType: candidate.rta,
            fromAddress: candidate.fromAddress,
            subject: candidate.subject,
            receivedAt: candidate.receivedAt,
            messageId: candidate.messageId,
            status: "NO_LINK",
          },
        });

        try {
          const full = await client.fetchOne(String(candidate.uid), { source: true }, { uid: true });
          if (!full || !full.source) {
            skipped++;
            continue;
          }

          const parsed = await simpleParser(full.source);
          const bodyText = parsed.text ?? "";
          const bodyHtml = typeof parsed.html === "string" ? parsed.html : undefined;
          const downloadUrl = extractDownloadLink(candidate.rta, bodyText, bodyHtml, candidate.subject);
          if (!downloadUrl) {
            skipped++;
            continue;
          }

          const toAddresses = (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
            .flatMap((addr) => addr.value.map((v) => v.address))
            .filter((a): a is string => Boolean(a));
          const headerMatch = await matchRecipientToDistributor(toAddresses);

          await prisma.mailIngestionLog.update({
            where: { id: mailLog.id },
            data: {
              downloadUrl,
              status: "ENQUEUED",
              distributorId: headerMatch?.distributorId,
              arnProfileId: headerMatch?.arnProfileId,
            },
          });
          await archiveDecryptionQueue().add("archive-decryption", {
            downloadUrl,
            rtaType: candidate.rta,
            expectedDistributorId: headerMatch?.distributorId,
            mailLogId: mailLog.id,
          });
          enqueued++;
        } finally {
          await client.messageFlagsAdd(candidate.uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      try {
        lock.release();
      } catch {
        // connection may already be dead (e.g. the socket-timeout case above) — nothing to clean up
      }
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // same as above: a dead connection can't be logged out of gracefully, and the
      // original error (if any) from the try block is what actually matters here
    }
  }

  return { enqueued, skipped };
}
