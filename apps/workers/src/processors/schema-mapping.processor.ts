import { createHash } from "node:crypto";
import { Job } from "bullmq";
import { Prisma, prisma } from "@mfd/db";
import {
  identifyReport,
  mapMfsd201Record,
  mapInvestorMasterRecord,
  mapClientAumRecord,
  mapSipRegistrationRecord,
} from "@mfd/shared";
import { readDbfRecords } from "../parsing/dbf-reader";
import { readDelimitedRecords } from "../parsing/delimited-reader";
import { resolveClientAndFolioId, upsertInvestorMasterClientAndFolio } from "../crm-sync";

export interface SchemaMappingJobData {
  distributorId: string;
  rtaType: "CAMS" | "KFINTECH";
  sourceFormat: "DBF" | "CSV" | "TXT";
  fileContents: Buffer;
}

type LedgerRow = Prisma.RtaInsightLedgerCreateManyInput;

function hash(parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.map((p) => p ?? "").join("|"))
    .digest("hex");
}

/** Deep-converts Dates to ISO strings so the normalized record is valid JSONB payload. */
function toJsonPayload(record: object) {
  return JSON.parse(
    JSON.stringify(record, (_key, value) => (value instanceof Date ? value.toISOString() : value)),
  );
}

/**
 * Phase 1: parses CAMS .dbf / KFintech .csv / either RTA's inception .txt,
 * identifies the report layout, and maps rows into rta_insight_ledger (the
 * raw normalized landing zone, every report type). MFSD201 (transaction)
 * and investor master (CAMS WBR9 / KFintech MFSD211) additionally sync into
 * the CRM tables (Client/Folio/Transaction) that the dashboard reads from —
 * client AUM/balance (WBR4/MFSD203) and SIP registration (WBR49/MFSD243)
 * are ledger-only for now. Anything unidentified falls through to the
 * "unsupported layout" error, which is where the LLM schema broker will
 * eventually take over.
 */
export async function processSchemaMapping(job: Job<SchemaMappingJobData>) {
  const { distributorId, rtaType, sourceFormat, fileContents } = job.data;

  const rawRecords =
    sourceFormat === "DBF" ? await readDbfRecords(fileContents) : readDelimitedRecords(fileContents);

  if (rawRecords.length === 0) {
    return { inserted: 0 };
  }

  const reportCode = identifyReport(rawRecords[0], sourceFormat, rtaType);
  if (!reportCode) {
    throw new Error(
      `Unsupported report layout (distributorId=${distributorId}, rtaType=${rtaType}, sourceFormat=${sourceFormat}): ` +
        "does not match any known report definition. Needs LLM schema broker support (not yet implemented).",
    );
  }

  let rows: LedgerRow[];

  switch (reportCode) {
    case "MFSD201": {
      const normalized = rawRecords.map((raw) => mapMfsd201Record(raw, sourceFormat, rtaType));

      rows = normalized.map((r) => ({
        distributorId,
        rtaType,
        reportCode,
        investorPan: r.investorPan,
        folioNumber: r.folioNumber,
        amcCode: r.amcCode,
        schemeCode: r.productCode,
        transactionDate: r.postDate,
        rawStructuredPayload: toJsonPayload(r),
        // Folio+date+scheme+amount+units alone is NOT safe: confirmed against
        // real data that distinct transactions (e.g. two different investors'
        // same-amount SIP installments on the same day) can share all five
        // values. transactionNumber alone isn't safe either — KFintech reuses
        // transaction numbers years apart, and its "WITH SPLIT" export gives
        // one transaction number multiple legitimate sub-rows with different
        // amounts. The combination of all of these together was empirically
        // validated as collision-free (except for genuine exact duplicates)
        // across ~145k real transaction rows from both RTAs.
        idempotencyHash: hash([
          distributorId,
          r.folioNumber,
          r.transactionNumber,
          r.postDate.toISOString(),
          r.productCode,
          r.amount,
          r.units,
        ]),
      }));

      // Resolve Client+Folio once per unique folio (memoized), not once per
      // transaction — a folio typically has many transactions, and each
      // resolution is a DB round trip.
      const folioCache = new Map<string, Promise<{ clientId: string; folioId: string }>>();
      const resolveFolio = (r: (typeof normalized)[number]) => {
        const key = `${r.amcCode}|${r.folioNumber}|${r.productCode}`;
        let cached = folioCache.get(key);
        if (!cached) {
          cached = resolveClientAndFolioId({
            distributorId,
            panNumber: r.investorPan,
            investorName: r.investorName,
            amcCode: r.amcCode,
            folioNumber: r.folioNumber,
            schemeCode: r.productCode,
          });
          folioCache.set(key, cached);
        }
        return cached;
      };

      const transactionRows: Prisma.TransactionCreateManyInput[] = [];
      for (let i = 0; i < normalized.length; i++) {
        const r = normalized[i];
        const { folioId } = await resolveFolio(r);
        transactionRows.push({
          distributorId,
          folioId,
          transactionType: r.transactionType,
          transactionDate: r.postDate,
          amount: r.amount,
          units: r.units,
          navPerUnit: r.navPerUnit,
          idempotencyHash: rows[i].idempotencyHash,
        });
      }
      await prisma.transaction.createMany({ data: transactionRows, skipDuplicates: true });
      break;
    }
    case "INVESTOR_MASTER": {
      const normalized = rawRecords.map((raw) => mapInvestorMasterRecord(raw, rtaType));

      rows = normalized.map((r) => ({
        distributorId,
        rtaType,
        reportCode,
        investorPan: r.investorPan,
        folioNumber: r.folioNumber,
        amcCode: r.amcCode,
        schemeCode: r.productCode,
        transactionDate: r.reportDate,
        rawStructuredPayload: toJsonPayload(r),
        // folio+PAN+reportDate alone collides: one folio can hold multiple
        // schemes under the same AMC, producing multiple investor-master
        // rows for the same folio/PAN/date. productCode disambiguates —
        // confirmed collision-free against real WBR9/MFSD211 data.
        idempotencyHash: hash([distributorId, r.folioNumber, r.productCode, r.investorPan, r.reportDate?.toISOString()]),
      }));

      for (const r of normalized) {
        await upsertInvestorMasterClientAndFolio({
          distributorId,
          panNumber: r.investorPan,
          investorName: r.investorName,
          email: r.email,
          mobile: r.mobile,
          dateOfBirth: r.dateOfBirth,
          amcCode: r.amcCode,
          folioNumber: r.folioNumber,
          productCode: r.productCode,
        });
      }
      break;
    }
    case "CLIENT_AUM": {
      rows = rawRecords.map((raw) => {
        const r = mapClientAumRecord(raw, rtaType);
        return {
          distributorId,
          rtaType,
          reportCode,
          investorPan: r.investorPan,
          folioNumber: r.folioNumber,
          amcCode: r.amcCode,
          schemeCode: r.productCode,
          transactionDate: r.reportDate,
          rawStructuredPayload: toJsonPayload(r),
          idempotencyHash: hash([distributorId, r.folioNumber, r.productCode, r.reportDate?.toISOString()]),
        };
      });
      break;
    }
    case "SIP_REGISTRATION": {
      rows = rawRecords.map((raw) => {
        const r = mapSipRegistrationRecord(raw, rtaType);
        return {
          distributorId,
          rtaType,
          reportCode,
          investorPan: r.investorPan,
          folioNumber: r.folioNumber,
          amcCode: r.amcCode,
          schemeCode: r.schemeCode,
          transactionDate: r.registrationDate,
          rawStructuredPayload: toJsonPayload(r),
          // folio+scheme+registrationDate alone collides: the same folio/scheme
          // can carry multiple registration records dated the same day (top-ups,
          // amendments). Adding startDate/sipAmount/endDate/ceaseDate closed
          // ~90%+ of collisions against real WBR49/MFSD243 data; the handful
          // that remain matched on every field checked, i.e. genuine duplicates.
          idempotencyHash: hash([
            distributorId,
            r.folioNumber,
            r.schemeCode,
            r.registrationDate.toISOString(),
            r.startDate?.toISOString(),
            r.endDate?.toISOString(),
            r.ceaseDate?.toISOString(),
            r.sipAmount,
          ]),
        };
      });
      break;
    }
  }

  const result = await prisma.rtaInsightLedger.createMany({ data: rows, skipDuplicates: true });
  return { inserted: result.count };
}
