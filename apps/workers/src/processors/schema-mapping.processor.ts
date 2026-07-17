import { createHash } from "node:crypto";
import { Job } from "bullmq";
import { prisma } from "@mfd/db";
import { looksLikeMfsd201, mapMfsd201Record, NormalizedTransactionRecord } from "@mfd/shared";
import { readDbfRecords } from "../parsing/dbf-reader";
import { readDelimitedRecords } from "../parsing/delimited-reader";

export interface SchemaMappingJobData {
  distributorId: string;
  rtaType: "CAMS" | "KFINTECH";
  sourceFormat: "DBF" | "CSV" | "TXT";
  fileContents: Buffer;
}

function computeIdempotencyHash(distributorId: string, record: NormalizedTransactionRecord): string {
  const input = [
    distributorId,
    record.folioNumber,
    record.postDate.toISOString(),
    record.productCode,
    record.amount ?? "",
    record.units ?? "",
  ].join("|");
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Phase 1: parses CAMS .dbf / KFintech .csv / either RTA's inception .txt,
 * identifies the report layout, and maps rows into rta_insight_ledger.
 * Currently only MFSD 201 (Transaction Report) is a known layout — anything
 * else falls through to the "unsupported layout" error, which is where the
 * LLM schema broker will eventually take over.
 */
export async function processSchemaMapping(job: Job<SchemaMappingJobData>) {
  const { distributorId, rtaType, sourceFormat, fileContents } = job.data;

  const rawRecords =
    sourceFormat === "DBF"
      ? await readDbfRecords(fileContents)
      : readDelimitedRecords(fileContents);

  if (rawRecords.length === 0) {
    return { inserted: 0 };
  }

  if (!looksLikeMfsd201(rawRecords[0], sourceFormat, rtaType)) {
    throw new Error(
      `Unsupported report layout (distributorId=${distributorId}, rtaType=${rtaType}, sourceFormat=${sourceFormat}): ` +
        "does not match any known report definition. Needs LLM schema broker support (not yet implemented).",
    );
  }

  const normalized = rawRecords.map((raw) => mapMfsd201Record(raw, sourceFormat, rtaType));

  const result = await prisma.rtaInsightLedger.createMany({
    data: normalized.map((record) => ({
      distributorId,
      rtaType,
      reportCode: "MFSD201",
      investorPan: record.investorPan,
      folioNumber: record.folioNumber,
      amcCode: record.amcCode,
      schemeCode: record.productCode,
      transactionDate: record.postDate,
      rawStructuredPayload: JSON.parse(
        JSON.stringify({ ...record, postDate: record.postDate.toISOString(), tradeDate: record.tradeDate?.toISOString() }),
      ),
      idempotencyHash: computeIdempotencyHash(distributorId, record),
    })),
    skipDuplicates: true,
  });

  return { inserted: result.count };
}
