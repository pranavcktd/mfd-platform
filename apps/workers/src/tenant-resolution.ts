import { prisma } from "@mfd/db";

/** "ARN-91053" / "arn 91053" / "91053" all normalize to "91053", matching how ArnProfile.arnNumber is stored. */
export function normalizeArnCode(rawArnCode: string): string {
  return rawArnCode.trim().toUpperCase().replace(/^ARN[-\s]?/, "");
}

export interface ResolvedTenant {
  distributorId: string;
  arnProfileId: string;
}

async function resolveByArnCode(rawArnCode: string): Promise<ResolvedTenant | null> {
  const arnNumber = normalizeArnCode(rawArnCode);
  const arnProfile = await prisma.arnProfile.findUnique({
    where: { arnNumber },
    select: { id: true, distributorId: true },
  });
  return arnProfile ? { distributorId: arnProfile.distributorId, arnProfileId: arnProfile.id } : null;
}

/**
 * Determines which onboarded Distributor/ArnProfile a batch of parsed RTA
 * records belongs to, using the broker ARN code embedded in the report
 * data itself (e.g. "ARN-91053") rather than trusting an upstream caller
 * to already know — this is the tenant boundary for multi-tenant data
 * isolation, so it fails closed rather than guessing:
 *  - some report types (SIP registration) leave the ARN code blank on many
 *    rows, so this scans the whole batch rather than just the first row;
 *  - if the batch contains MORE THAN ONE distinct non-blank ARN code, that
 *    means mixed-tenant data in a single file — refuses to pick one rather
 *    than risk silently attributing one tenant's data to another;
 *  - if the (single, consistent) ARN code doesn't match any onboarded
 *    ArnProfile, refuses rather than fabricating a tenant.
 * This is also intended as a cross-check against mail-header-based routing
 * (matching the original recipient against ArnProfile.camsMailId) once the
 * mail-ingestion pipeline is built — two independent signals agreeing is
 * safer than trusting either alone for something this security-sensitive.
 */
export async function resolveTenantFromRecords<T extends { brokerArnCode?: string }>(
  records: T[],
): Promise<ResolvedTenant> {
  const distinctCodes = new Set(
    records.map((r) => r.brokerArnCode).filter((code): code is string => Boolean(code)),
  );

  if (distinctCodes.size === 0) {
    throw new Error("No record in this batch carries a broker ARN code — cannot determine the owning distributor");
  }
  if (distinctCodes.size > 1) {
    throw new Error(
      `Batch contains ${distinctCodes.size} distinct broker ARN codes (${[...distinctCodes].join(", ")}) — ` +
        "refusing to guess which tenant this data belongs to",
    );
  }

  const [arnCode] = distinctCodes;
  const resolved = await resolveByArnCode(arnCode);
  if (!resolved) {
    throw new Error(`ARN code "${arnCode}" does not match any onboarded ArnProfile`);
  }
  return resolved;
}
