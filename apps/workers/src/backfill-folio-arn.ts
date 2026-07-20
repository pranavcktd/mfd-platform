import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "@mfd/db";
import { normalizeArnCode } from "./tenant-resolution";

/**
 * One-off backfill: every Folio created before schema-mapping.processor.ts
 * started threading arnProfileId through has it as null, even though the
 * ARN code was always available — it's embedded in every
 * RtaInsightLedger.rawStructuredPayload.brokerArnCode from the same
 * ingestion run that created the folio. Recovers it from there instead of
 * re-running ingestion.
 */
async function main() {
  const arnProfiles = await prisma.arnProfile.findMany({ select: { id: true, arnNumber: true } });
  const arnProfileByNumber = new Map(arnProfiles.map((a) => [a.arnNumber, a.id]));

  const ledgerRows = await prisma.rtaInsightLedger.findMany({
    where: { amcCode: { not: null }, folioNumber: { not: null }, schemeCode: { not: null } },
    select: { distributorId: true, amcCode: true, folioNumber: true, schemeCode: true, rawStructuredPayload: true },
  });

  // key: distributorId|amcCode|folioNumber|schemeCode -> arnProfileId
  const arnByFolioKey = new Map<string, string>();
  for (const row of ledgerRows) {
    const payload = row.rawStructuredPayload as Record<string, unknown> | null;
    const rawArnCode = typeof payload?.brokerArnCode === "string" ? payload.brokerArnCode : undefined;
    if (!rawArnCode) continue;
    const arnProfileId = arnProfileByNumber.get(normalizeArnCode(rawArnCode));
    if (!arnProfileId) continue;
    const key = `${row.distributorId}|${row.amcCode}|${row.folioNumber}|${row.schemeCode}`;
    arnByFolioKey.set(key, arnProfileId);
  }

  const folios = await prisma.folio.findMany({
    where: { arnProfileId: null },
    select: { id: true, distributorId: true, amcCode: true, folioNumber: true, schemeCode: true },
  });

  let updated = 0;
  let unmatched = 0;
  for (const folio of folios) {
    const key = `${folio.distributorId}|${folio.amcCode}|${folio.folioNumber}|${folio.schemeCode}`;
    const arnProfileId = arnByFolioKey.get(key);
    if (!arnProfileId) {
      unmatched++;
      continue;
    }
    await prisma.folio.update({ where: { id: folio.id }, data: { arnProfileId } });
    updated++;
  }

  console.log(`Backfilled ${updated} folios, ${unmatched} left unmatched (out of ${folios.length} null-ARN folios).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
