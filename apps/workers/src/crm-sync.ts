import { prisma } from "@mfd/db";

async function upsertFolioRow(
  distributorId: string,
  clientId: string,
  amcCode: string,
  folioNumber: string,
  schemeCode: string,
): Promise<string> {
  const folio = await prisma.folio.upsert({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
    create: { distributorId, clientId, amcCode, folioNumber, schemeCode },
    update: {},
  });
  return folio.id;
}

interface TransactionClientFolioParams {
  distributorId: string;
  panNumber?: string;
  investorName?: string;
  amcCode: string;
  folioNumber: string;
  schemeCode: string;
}

/**
 * Resolves (creating if needed) the Client+Folio for a transaction-sourced
 * record. Non-destructive on Client — never overwrites name/demographic
 * fields, since a transaction row only ever carries a bare investor name,
 * and investor-master data (see upsertInvestorMasterClientAndFolio) is the
 * authoritative source for those fields.
 *
 * PAN is the only stable cross-folio client identity we have. When it's
 * missing, the folio itself becomes the identity: a folio number is scoped
 * per-AMC, so a fresh non-PAN folio gets its own 1:1 Client, and a folio
 * we've already seen reuses its existing Client rather than minting a new
 * one on every re-ingestion. This means one real investor with multiple
 * non-PAN folios ends up as multiple Client rows — a known limitation
 * (fixing it needs a name/DOB/address fuzzy-match strategy, not attempted
 * here), not a bug in the folio-reuse logic itself.
 */
export async function resolveClientAndFolioId(
  params: TransactionClientFolioParams,
): Promise<{ clientId: string; folioId: string }> {
  const { distributorId, panNumber, investorName, amcCode, folioNumber, schemeCode } = params;

  if (panNumber) {
    const client = await prisma.client.upsert({
      where: { distributorId_panNumber: { distributorId, panNumber } },
      create: { distributorId, panNumber, name: investorName ?? "Unknown" },
      update: {},
    });
    const folioId = await upsertFolioRow(distributorId, client.id, amcCode, folioNumber, schemeCode);
    return { clientId: client.id, folioId };
  }

  const existingFolio = await prisma.folio.findUnique({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
  });
  if (existingFolio) {
    return { clientId: existingFolio.clientId, folioId: existingFolio.id };
  }
  const client = await prisma.client.create({ data: { distributorId, name: investorName ?? "Unknown" } });
  const folio = await prisma.folio.create({
    data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode },
  });
  return { clientId: client.id, folioId: folio.id };
}

interface InvestorMasterClientFolioParams {
  distributorId: string;
  panNumber?: string;
  investorName: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: Date;
  amcCode?: string;
  folioNumber: string;
  productCode?: string;
}

/**
 * Upserts Client+Folio from an investor-master record. Unlike the
 * transaction path, this DOES overwrite name/email/mobile/dateOfBirth on
 * every run — investor-master is the authoritative demographic source, so
 * later (fresher) snapshots should win. amcCode/productCode are optional
 * here because not every investor-master row is guaranteed to carry them;
 * when either is absent there's nothing to key a Folio on, so folioId is
 * null. Same non-PAN folio-reuse idempotency logic as the transaction path
 * — without it, re-ingesting the same non-PAN investor-master file would
 * mint a fresh duplicate Client on every run instead of enriching the one
 * already tied to that folio.
 */
export async function upsertInvestorMasterClientAndFolio(
  params: InvestorMasterClientFolioParams,
): Promise<{ clientId: string; folioId: string | null }> {
  const { distributorId, panNumber, investorName, email, mobile, dateOfBirth, amcCode, folioNumber, productCode } =
    params;
  const clientData = {
    name: investorName,
    email: email ?? null,
    phone: mobile ?? null,
    dateOfBirth: dateOfBirth ?? null,
  };

  if (panNumber) {
    const client = await prisma.client.upsert({
      where: { distributorId_panNumber: { distributorId, panNumber } },
      create: { distributorId, panNumber, ...clientData },
      update: clientData,
    });
    const folioId =
      amcCode && productCode
        ? await upsertFolioRow(distributorId, client.id, amcCode, folioNumber, productCode)
        : null;
    return { clientId: client.id, folioId };
  }

  if (amcCode && productCode) {
    const existingFolio = await prisma.folio.findUnique({
      where: {
        distributorId_amcCode_folioNumber_schemeCode: {
          distributorId,
          amcCode,
          folioNumber,
          schemeCode: productCode,
        },
      },
    });
    if (existingFolio) {
      await prisma.client.update({ where: { id: existingFolio.clientId }, data: clientData });
      return { clientId: existingFolio.clientId, folioId: existingFolio.id };
    }
    const client = await prisma.client.create({ data: { distributorId, ...clientData } });
    const folio = await prisma.folio.create({
      data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode: productCode },
    });
    return { clientId: client.id, folioId: folio.id };
  }

  const client = await prisma.client.create({ data: { distributorId, ...clientData } });
  return { clientId: client.id, folioId: null };
}
