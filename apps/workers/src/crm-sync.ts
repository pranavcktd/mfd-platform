import { prisma } from "@mfd/db";

async function upsertFolioRow(
  distributorId: string,
  clientId: string,
  amcCode: string,
  folioNumber: string,
  schemeCode: string,
  arnProfileId?: string,
): Promise<string> {
  // arnProfileId is set on both create AND update (not just create): every
  // caller in a given ingestion run resolves it from the same batch-wide
  // ARN code (see tenant-resolution.ts's single-ARN-per-batch invariant),
  // so re-asserting it on every upsert is safe and also self-heals any
  // Folio row created before this field was threaded through at all.
  const folio = await prisma.folio.upsert({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
    create: { distributorId, clientId, amcCode, folioNumber, schemeCode, arnProfileId },
    update: { arnProfileId },
  });
  return folio.id;
}

interface TransactionClientFolioParams {
  distributorId: string;
  arnProfileId?: string;
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
  const { distributorId, arnProfileId, panNumber, investorName, amcCode, folioNumber, schemeCode } = params;

  if (panNumber) {
    const client = await prisma.client.upsert({
      where: { distributorId_panNumber: { distributorId, panNumber } },
      create: { distributorId, panNumber, name: investorName ?? "Unknown" },
      update: {},
    });
    const folioId = await upsertFolioRow(distributorId, client.id, amcCode, folioNumber, schemeCode, arnProfileId);
    return { clientId: client.id, folioId };
  }

  const existingFolio = await prisma.folio.findUnique({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
  });
  if (existingFolio) {
    if (arnProfileId && existingFolio.arnProfileId !== arnProfileId) {
      await prisma.folio.update({ where: { id: existingFolio.id }, data: { arnProfileId } });
    }
    return { clientId: existingFolio.clientId, folioId: existingFolio.id };
  }
  const client = await prisma.client.create({ data: { distributorId, name: investorName ?? "Unknown" } });
  const folio = await prisma.folio.create({
    data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode, arnProfileId },
  });
  return { clientId: client.id, folioId: folio.id };
}

interface InvestorMasterClientFolioParams {
  distributorId: string;
  arnProfileId?: string;
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
  const {
    distributorId,
    arnProfileId,
    panNumber,
    investorName,
    email,
    mobile,
    dateOfBirth,
    amcCode,
    folioNumber,
    productCode,
  } = params;
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
        ? await upsertFolioRow(distributorId, client.id, amcCode, folioNumber, productCode, arnProfileId)
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
      if (arnProfileId && existingFolio.arnProfileId !== arnProfileId) {
        await prisma.folio.update({ where: { id: existingFolio.id }, data: { arnProfileId } });
      }
      return { clientId: existingFolio.clientId, folioId: existingFolio.id };
    }
    const client = await prisma.client.create({ data: { distributorId, ...clientData } });
    const folio = await prisma.folio.create({
      data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode: productCode, arnProfileId },
    });
    return { clientId: client.id, folioId: folio.id };
  }

  const client = await prisma.client.create({ data: { distributorId, ...clientData } });
  return { clientId: client.id, folioId: null };
}

interface FolioBalanceParams {
  folioId: string;
  balanceUnits?: number;
  valuationAmount?: number;
  navPerUnit?: number;
  asOfDate?: Date;
}

/**
 * Updates a Folio's latest-known balance snapshot, but only if the new
 * data is actually newer than what's stored — otherwise an out-of-order or
 * re-run ingestion (e.g. reprocessing an older backfill file after a fresh
 * daily one already landed) would regress current AUM with stale numbers.
 * Silently no-ops without an asOfDate, since there's nothing to compare.
 */
export async function updateFolioBalance(params: FolioBalanceParams): Promise<void> {
  const { folioId, balanceUnits, valuationAmount, navPerUnit, asOfDate } = params;
  if (!asOfDate) {
    return;
  }
  const folio = await prisma.folio.findUniqueOrThrow({
    where: { id: folioId },
    select: { balanceAsOfDate: true },
  });
  if (folio.balanceAsOfDate && folio.balanceAsOfDate >= asOfDate) {
    return;
  }
  await prisma.folio.update({
    where: { id: folioId },
    data: { balanceUnits, valuationAmount, navPerUnit, balanceAsOfDate: asOfDate },
  });
}

interface SipRegistrationParams {
  distributorId: string;
  folioId: string;
  schemeCode?: string;
  sipAmount?: number;
  frequency?: string;
  startDate?: Date;
  endDate?: Date;
  registrationDate: Date;
  ceaseDate?: Date;
  isActive: boolean;
  idempotencyHash: string;
}

/** Immutable event record, same pattern as Transaction — upsert by idempotencyHash, never mutate an existing row. */
export async function upsertSipRegistration(params: SipRegistrationParams): Promise<void> {
  const { idempotencyHash, ...data } = params;
  await prisma.sipRegistration.upsert({
    where: { idempotencyHash },
    create: { idempotencyHash, ...data },
    update: {},
  });
}
