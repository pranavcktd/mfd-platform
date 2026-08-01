import { Prisma, prisma } from "@mfd/db";

/**
 * Plain function, not a NestJS-injectable service — this is a small
 * cross-cutting concern used from both admin.service.ts and mail.service.ts,
 * and doesn't need DI machinery. distributorId is optional since some
 * actions (sync-all, schedule pause/resume) aren't scoped to one tenant.
 */
export async function logAdminAction(
  action: string,
  distributorId?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: { action, distributorId, detail: (detail as Prisma.InputJsonValue) ?? undefined },
  });
}
