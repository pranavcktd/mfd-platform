import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "@mfd/db";

/**
 * One-off backfill (2026-07-22): populates fields added to Client/Folio/
 * Transaction after most of the real data was already ingested — same
 * "recover from RtaInsightLedger.rawStructuredPayload instead of
 * re-running ingestion" pattern as backfill-folio-arn.ts.
 */
async function backfillTransactions() {
  const rows = await prisma.rtaInsightLedger.findMany({
    where: { reportCode: "MFSD201" },
    select: { idempotencyHash: true, rawStructuredPayload: true },
  });

  let updated = 0;
  for (const row of rows) {
    const payload = row.rawStructuredPayload as Record<string, unknown> | null;
    const transactionDescription = typeof payload?.transactionDescription === "string" ? payload.transactionDescription : undefined;
    const brokeragePercent = typeof payload?.brokeragePercent === "number" ? payload.brokeragePercent : undefined;
    const brokerageAmount = typeof payload?.brokerageAmount === "number" ? payload.brokerageAmount : undefined;
    if (!transactionDescription && brokeragePercent === undefined && brokerageAmount === undefined) {
      continue;
    }
    const result = await prisma.transaction.updateMany({
      where: { idempotencyHash: row.idempotencyHash },
      data: {
        ...(transactionDescription ? { transactionDescription } : {}),
        ...(brokeragePercent !== undefined ? { brokeragePercent } : {}),
        ...(brokerageAmount !== undefined ? { brokerageAmount } : {}),
      },
    });
    updated += result.count;
  }
  console.log(`Transactions: backfilled ${updated} rows (out of ${rows.length} MFSD201 ledger rows checked).`);
}

async function backfillFolios() {
  const rows = await prisma.rtaInsightLedger.findMany({
    where: { reportCode: { in: ["MFSD201", "CLIENT_AUM"] }, amcCode: { not: null }, folioNumber: { not: null }, schemeCode: { not: null } },
    select: { distributorId: true, amcCode: true, folioNumber: true, schemeCode: true, rawStructuredPayload: true },
  });

  // key: distributorId|amcCode|folioNumber|schemeCode -> {schemeName, assetClass}
  const byFolioKey = new Map<string, { schemeName?: string; assetClass?: string }>();
  for (const row of rows) {
    const payload = row.rawStructuredPayload as Record<string, unknown> | null;
    const schemeName = typeof payload?.schemeDescription === "string" ? payload.schemeDescription : undefined;
    const assetClass = typeof payload?.assetClass === "string" ? payload.assetClass : undefined;
    if (!schemeName && !assetClass) continue;
    const key = `${row.distributorId}|${row.amcCode}|${row.folioNumber}|${row.schemeCode}`;
    if (!byFolioKey.has(key) || assetClass) {
      byFolioKey.set(key, { schemeName, assetClass });
    }
  }

  const folios = await prisma.folio.findMany({
    where: { OR: [{ schemeName: null }, { assetClass: null }] },
    select: { id: true, distributorId: true, amcCode: true, folioNumber: true, schemeCode: true },
  });

  let updated = 0;
  for (const folio of folios) {
    const key = `${folio.distributorId}|${folio.amcCode}|${folio.folioNumber}|${folio.schemeCode}`;
    const found = byFolioKey.get(key);
    if (!found) continue;
    await prisma.folio.update({
      where: { id: folio.id },
      data: {
        ...(found.schemeName ? { schemeName: found.schemeName } : {}),
        ...(found.assetClass ? { assetClass: found.assetClass } : {}),
      },
    });
    updated++;
  }
  console.log(`Folios: backfilled ${updated} of ${folios.length} folios missing scheme name/asset class.`);
}

async function backfillClients() {
  const rows = await prisma.rtaInsightLedger.findMany({
    where: { reportCode: "INVESTOR_MASTER" },
    select: { distributorId: true, investorPan: true, amcCode: true, folioNumber: true, schemeCode: true, rawStructuredPayload: true },
  });

  interface Enrichment {
    address1?: string;
    address2?: string;
    city?: string;
    pincode?: string;
    taxStatus?: string;
    bankAccountNumber?: string;
    bankName?: string;
  }
  const byPan = new Map<string, Enrichment>();
  const byFolioKey = new Map<string, Enrichment>();

  for (const row of rows) {
    const payload = row.rawStructuredPayload as Record<string, unknown> | null;
    const enrichment: Enrichment = {
      address1: typeof payload?.address1 === "string" ? payload.address1 : undefined,
      address2: typeof payload?.address2 === "string" ? payload.address2 : undefined,
      city: typeof payload?.city === "string" ? payload.city : undefined,
      pincode: typeof payload?.pincode === "string" ? payload.pincode : undefined,
      taxStatus: typeof payload?.taxStatus === "string" ? payload.taxStatus : undefined,
      bankAccountNumber: typeof payload?.bankAccountNumber === "string" ? payload.bankAccountNumber : undefined,
      bankName: typeof payload?.bankName === "string" ? payload.bankName : undefined,
    };
    if (!Object.values(enrichment).some(Boolean)) continue;

    if (row.investorPan) {
      byPan.set(`${row.distributorId}|${row.investorPan}`, enrichment);
    } else if (row.amcCode && row.folioNumber && row.schemeCode) {
      byFolioKey.set(`${row.distributorId}|${row.amcCode}|${row.folioNumber}|${row.schemeCode}`, enrichment);
    }
  }

  const clients = await prisma.client.findMany({
    where: { OR: [{ address1: null }, { bankAccountNumber: null }] },
    select: { id: true, distributorId: true, panNumber: true },
  });

  let updatedByPan = 0;
  let updatedByFolio = 0;
  for (const client of clients) {
    let enrichment: Enrichment | undefined;
    if (client.panNumber) {
      enrichment = byPan.get(`${client.distributorId}|${client.panNumber}`);
      if (enrichment) updatedByPan++;
    }
    if (!enrichment) {
      const folios = await prisma.folio.findMany({
        where: { clientId: client.id },
        select: { amcCode: true, folioNumber: true, schemeCode: true },
        take: 5,
      });
      for (const f of folios) {
        const found = byFolioKey.get(`${client.distributorId}|${f.amcCode}|${f.folioNumber}|${f.schemeCode}`);
        if (found) {
          enrichment = found;
          updatedByFolio++;
          break;
        }
      }
    }
    if (!enrichment) continue;
    await prisma.client.update({
      where: { id: client.id },
      data: {
        ...(enrichment.address1 ? { address1: enrichment.address1 } : {}),
        ...(enrichment.address2 ? { address2: enrichment.address2 } : {}),
        ...(enrichment.city ? { city: enrichment.city } : {}),
        ...(enrichment.pincode ? { pincode: enrichment.pincode } : {}),
        ...(enrichment.taxStatus ? { taxStatus: enrichment.taxStatus } : {}),
        ...(enrichment.bankAccountNumber ? { bankAccountNumber: enrichment.bankAccountNumber } : {}),
        ...(enrichment.bankName ? { bankName: enrichment.bankName } : {}),
      },
    });
  }
  console.log(
    `Clients: backfilled ${updatedByPan + updatedByFolio} of ${clients.length} clients missing address/bank data ` +
      `(${updatedByPan} matched by PAN, ${updatedByFolio} matched by folio).`,
  );
}

async function main() {
  await backfillTransactions();
  await backfillFolios();
  await backfillClients();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
