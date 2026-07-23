import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../../.env") });

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prisma } from "@mfd/db";
import { mapMfsd201Record } from "@mfd/shared";
import { readDbfRecords } from "./parsing/dbf-reader";
import { readDelimitedRecords } from "./parsing/delimited-reader";

/**
 * One-off backfill (2026-07-22): transactionDescription/brokeragePercent/
 * brokerageAmount/Folio.assetClass didn't exist in the parser when the bulk
 * since-inception load ran, so RtaInsightLedger's raw payload for those
 * ~79k historical rows doesn't carry them either (unlike schemeDescription/
 * address/bank fields, which existed from the start — see
 * backfill-enriched-fields.ts). The only way to recover them for historical
 * rows is to re-parse the original source files directly, which are still
 * on disk in `basic data/`, and match back to existing Transaction rows by
 * the exact same idempotencyHash formula schema-mapping.processor.ts uses
 * (not re-running the full pipeline, which would skip existing rows anyway
 * via createMany's skipDuplicates).
 */
const DISTRIBUTOR_ID = "ad9c9003-7604-47a5-9309-c57ffc209ab6"; // ARN 91053 (Naresh Kumar Singh)

const FILES: Array<{ path: string; rtaType: "CAMS" | "KFINTECH"; sourceFormat: "DBF" | "CSV" }> = [
  {
    path: "basic data/data as on 17-07-2026/cams/WBR2/17072026083626_217692381R2.dbf",
    rtaType: "CAMS",
    sourceFormat: "DBF",
  },
  {
    path: "basic data/data as on 17-07-2026/kfintech/MFSD201_WITH SPLIT/MFSD201_WBTRN29018323_400103.csv",
    rtaType: "KFINTECH",
    sourceFormat: "CSV",
  },
  {
    path: "basic data/data as on 17-07-2026/kfintech/MFSD201_WITHOUT SPLIT/MFSD201_WBTRN29018354_401675.csv",
    rtaType: "KFINTECH",
    sourceFormat: "CSV",
  },
];

function hash(parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.map((p) => p ?? "").join("|"))
    .digest("hex");
}

async function main() {
  let txUpdated = 0;
  let folioUpdated = 0;
  const seenFolioKeys = new Set<string>();

  for (const file of FILES) {
    const fullPath = resolve(__dirname, "../../../", file.path);
    const buffer = await readFile(fullPath);
    const rawRecords = file.sourceFormat === "DBF" ? await readDbfRecords(buffer) : readDelimitedRecords(buffer);
    console.log(`\n${file.path}: ${rawRecords.length} raw records`);

    for (const raw of rawRecords) {
      const r = mapMfsd201Record(raw, file.sourceFormat, file.rtaType);
      const idempotencyHash = hash([
        DISTRIBUTOR_ID,
        r.folioNumber,
        r.transactionNumber,
        r.postDate.toISOString(),
        r.productCode,
        r.amount,
        r.units,
      ]);

      if (r.transactionDescription || r.brokeragePercent !== undefined || r.brokerageAmount !== undefined) {
        const result = await prisma.transaction.updateMany({
          where: { idempotencyHash },
          data: {
            ...(r.transactionDescription ? { transactionDescription: r.transactionDescription } : {}),
            ...(r.brokeragePercent !== undefined ? { brokeragePercent: r.brokeragePercent } : {}),
            ...(r.brokerageAmount !== undefined ? { brokerageAmount: r.brokerageAmount } : {}),
          },
        });
        txUpdated += result.count;
      }

      const folioKey = `${r.amcCode}|${r.folioNumber}|${r.productCode}`;
      if (r.assetClass && !seenFolioKeys.has(folioKey)) {
        seenFolioKeys.add(folioKey);
        const result = await prisma.folio.updateMany({
          where: { distributorId: DISTRIBUTOR_ID, amcCode: r.amcCode, folioNumber: r.folioNumber, schemeCode: r.productCode, assetClass: null },
          data: { assetClass: r.assetClass },
        });
        folioUpdated += result.count;
      }
    }
  }

  console.log(`\nDone. Transactions enriched: ${txUpdated}. Folios enriched with assetClass: ${folioUpdated}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
