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
import {
  resolveClientAndFolioId,
  upsertInvestorMasterClientAndFolio,
  updateFolioBalance,
  upsertSipRegistration,
} from "../crm-sync";
import { resolveTenantFromRecords } from "../tenant-resolution";

export interface SchemaMappingJobData {
  rtaType: "CAMS" | "KFINTECH";
  sourceFormat: "DBF" | "CSV" | "TXT";
  /**
   * Base64-encoded, NOT a raw Buffer — confirmed the hard way: BullMQ job
   * data round-trips through Redis as JSON, which does not preserve Buffer
   * instances. A Buffer serializes to {type:"Buffer",data:[...]} and comes
   * back on the worker side as a plain object, not a Buffer — silently
   * breaking anything that calls .toString() on it (delimiter sniffing saw
   * "[object Object]" instead of real CSV text). Always base64 across this
   * boundary; decode immediately inside the handler.
   */
  fileContents: string;
  /**
   * Optional cross-check from mail-ingestion (matched via the original
   * recipient header against ArnProfile.camsMailId). If present, it must
   * agree with the distributor resolved from the ARN code embedded in the
   * data itself — a mismatch is a routing error, not something to silently
   * trust from either side.
   */
  expectedDistributorId?: string;
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

async function resolveDistributorId(
  records: Array<{ brokerArnCode?: string }>,
  expectedDistributorId: string | undefined,
): Promise<string> {
  const tenant = await resolveTenantFromRecords(records);
  if (expectedDistributorId && expectedDistributorId !== tenant.distributorId) {
    throw new Error(
      `Tenant mismatch: mail-routing expected distributorId=${expectedDistributorId} but the ARN code in the ` +
        `data resolves to distributorId=${tenant.distributorId} (arnProfileId=${tenant.arnProfileId})`,
    );
  }
  return tenant.distributorId;
}

/**
 * Phase 1: parses CAMS .dbf / KFintech .csv / either RTA's inception .txt,
 * identifies the report layout, and maps rows into rta_insight_ledger (the
 * raw normalized landing zone, every report type). All four known report
 * types additionally sync into the CRM tables the dashboard reads from:
 * MFSD201 (transaction) -> Transaction, investor master (WBR9/MFSD211) ->
 * Client/Folio demographic enrichment, client AUM (WBR4/MFSD203) -> Folio's
 * latest balance snapshot, SIP registration (WBR49/MFSD243) ->
 * SipRegistration. Anything unidentified falls through to the "unsupported
 * layout" error, which is where the LLM schema broker will eventually take
 * over.
 *
 * Which distributor this data belongs to is resolved from the broker ARN
 * code embedded in the report rows themselves (see tenant-resolution.ts),
 * not supplied by the caller — multi-tenant routing lives here, not upstream.
 */
export async function processSchemaMapping(job: Job<SchemaMappingJobData>) {
  const { rtaType, sourceFormat, expectedDistributorId } = job.data;
  const fileContents = Buffer.from(job.data.fileContents, "base64");

  const rawRecords =
    sourceFormat === "DBF" ? await readDbfRecords(fileContents) : readDelimitedRecords(fileContents);

  if (rawRecords.length === 0) {
    return { inserted: 0 };
  }

  const reportCode = identifyReport(rawRecords[0], sourceFormat, rtaType);
  if (!reportCode) {
    throw new Error(
      `Unsupported report layout (rtaType=${rtaType}, sourceFormat=${sourceFormat}): ` +
        "does not match any known report definition. Needs LLM schema broker support (not yet implemented).",
    );
  }

  let rows: LedgerRow[];

  switch (reportCode) {
    case "MFSD201": {
      const normalized = rawRecords.map((raw) => mapMfsd201Record(raw, sourceFormat, rtaType));
      const distributorId = await resolveDistributorId(normalized, expectedDistributorId);

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
      const distributorId = await resolveDistributorId(normalized, expectedDistributorId);

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
      const normalized = rawRecords.map((raw) => mapClientAumRecord(raw, rtaType));
      const distributorId = await resolveDistributorId(normalized, expectedDistributorId);

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
        idempotencyHash: hash([distributorId, r.folioNumber, r.productCode, r.reportDate?.toISOString()]),
      }));

      for (const r of normalized) {
        if (!r.amcCode || !r.productCode) {
          continue; // nothing to key a Folio on without amcCode+productCode
        }
        const { folioId } = await resolveClientAndFolioId({
          distributorId,
          panNumber: r.investorPan,
          investorName: r.investorName,
          amcCode: r.amcCode,
          folioNumber: r.folioNumber,
          schemeCode: r.productCode,
        });
        await updateFolioBalance({
          folioId,
          balanceUnits: r.balanceUnits,
          valuationAmount: r.valuationAmount,
          navPerUnit: r.navPerUnit,
          asOfDate: r.reportDate,
        });
      }
      break;
    }
    case "SIP_REGISTRATION": {
      const normalized = rawRecords.map((raw) => mapSipRegistrationRecord(raw, rtaType));
      const distributorId = await resolveDistributorId(normalized, expectedDistributorId);

      rows = normalized.map((r) => ({
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
      }));

      for (let i = 0; i < normalized.length; i++) {
        const r = normalized[i];
        if (!r.amcCode || !r.productCode) {
          continue; // nothing to key a Folio on without amcCode+productCode
        }
        // Folio's schemeCode column is the full product code (matches the
        // convention used everywhere else — MFSD201/investor-master), not
        // this report's abbreviated "Scheme" field, which is only kept on
        // the SipRegistration row itself.
        const { folioId } = await resolveClientAndFolioId({
          distributorId,
          panNumber: r.investorPan,
          investorName: r.investorName,
          amcCode: r.amcCode,
          folioNumber: r.folioNumber,
          schemeCode: r.productCode,
        });
        await upsertSipRegistration({
          distributorId,
          folioId,
          schemeCode: r.schemeCode,
          sipAmount: r.sipAmount,
          frequency: r.frequency,
          startDate: r.startDate,
          endDate: r.endDate,
          registrationDate: r.registrationDate,
          ceaseDate: r.ceaseDate,
          isActive: r.isActive,
          idempotencyHash: rows[i].idempotencyHash,
        });
      }
      break;
    }
  }

  const result = await prisma.rtaInsightLedger.createMany({ data: rows, skipDuplicates: true });
  return { inserted: result.count };
}
