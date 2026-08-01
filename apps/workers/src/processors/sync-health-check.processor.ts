import { Job } from "bullmq";
import nodemailer from "nodemailer";
import { prisma } from "@mfd/db";

export type SyncHealthCheckJobData = Record<string, never>;

const STALE_SYNC_DAYS = 2;

interface HealthRow {
  distributorId: string;
  distributorName: string;
  rtaType: string;
  consecutiveDecryptFailures: number;
  lastSuccessAt: Date | null;
  staleCredential: boolean;
  noRecentSync: boolean;
}

/**
 * Same computation as apps/api/src/admin/status.service.ts's
 * getSyncHealth() — duplicated rather than shared across the apps/api /
 * apps/workers process boundary, same precedent as the audit-log write in
 * folder-import.processor.ts. The API version powers the on-demand
 * Platform Status page; this one runs on its own daily schedule so an
 * issue reaches an inbox even if nobody happens to open that page.
 */
async function computeSyncHealth(): Promise<HealthRow[]> {
  const distributors = await prisma.distributor.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const rtaTypes = ["CAMS", "KFINTECH"] as const;
  const flagged: HealthRow[] = [];

  for (const d of distributors) {
    for (const rtaType of rtaTypes) {
      const recentLogs = await prisma.mailIngestionLog.findMany({
        where: { distributorId: d.id, rtaType },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { status: true },
      });
      if (recentLogs.length === 0) continue;

      let consecutiveDecryptFailures = 0;
      for (const log of recentLogs) {
        if (log.status !== "DECRYPT_FAILED") break;
        consecutiveDecryptFailures++;
      }

      const lastSuccess = await prisma.mailIngestionLog.findFirst({
        where: { distributorId: d.id, rtaType, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const daysSinceSuccess = lastSuccess
        ? (Date.now() - lastSuccess.createdAt.getTime()) / (24 * 60 * 60 * 1000)
        : null;

      const staleCredential = consecutiveDecryptFailures >= 2;
      const noRecentSync = daysSinceSuccess === null || daysSinceSuccess > STALE_SYNC_DAYS;

      if (staleCredential || noRecentSync) {
        flagged.push({
          distributorId: d.id,
          distributorName: d.name,
          rtaType,
          consecutiveDecryptFailures,
          lastSuccessAt: lastSuccess?.createdAt ?? null,
          staleCredential,
          noRecentSync,
        });
      }
    }
  }

  return flagged;
}

/**
 * Daily digest, not per-issue spam: one email listing everything currently
 * flagged, sent once a day if anything's flagged — same reasoning as most
 * monitoring digests (a daily "still broken" reminder beats either silence
 * or a flood of one-off alerts). No de-dup/suppression state is kept, so a
 * standing issue re-alerts every day until fixed — treated as a feature,
 * not a bug, at this scale (one operator, a handful of MFDs).
 */
export async function processSyncHealthCheck(_job: Job<SyncHealthCheckJobData>) {
  const flagged = await computeSyncHealth();
  if (flagged.length === 0) {
    return { flagged: 0, emailSent: false };
  }

  const to = process.env.ADMIN_ALERT_EMAIL;
  const user = process.env.BACKEND_GMAIL_ADDRESS;
  const pass = process.env.BACKEND_GMAIL_APP_PASSWORD;
  if (!to || !user || !pass) {
    return { flagged: flagged.length, emailSent: false, reason: "ADMIN_ALERT_EMAIL or Gmail credentials not configured" };
  }

  const lines = flagged.map((row) => {
    const reasons: string[] = [];
    if (row.staleCredential) {
      reasons.push(`${row.consecutiveDecryptFailures} consecutive decrypt failures — zip password may be stale`);
    }
    if (row.noRecentSync) {
      reasons.push(row.lastSuccessAt ? `no successful sync since ${row.lastSuccessAt.toISOString()}` : "no successful sync recorded yet");
    }
    return `- ${row.distributorName} (${row.rtaType}): ${reasons.join("; ")}`;
  });

  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  try {
    await transporter.sendMail({
      from: user,
      to,
      subject: `MFD Platform: ${flagged.length} mail-sync issue(s) need attention`,
      text: `The following MFD/RTA combinations need attention:\n\n${lines.join("\n")}\n\nCheck Super Admin → Platform Status for details.`,
    });
    return { flagged: flagged.length, emailSent: true };
  } catch (err) {
    return { flagged: flagged.length, emailSent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
