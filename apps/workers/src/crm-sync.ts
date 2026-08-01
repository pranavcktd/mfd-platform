import { Prisma, prisma } from "@mfd/db";

async function upsertFolioRow(
  distributorId: string,
  clientId: string,
  amcCode: string,
  folioNumber: string,
  schemeCode: string,
  arnProfileId?: string,
  schemeName?: string,
  assetClass?: string,
  rtaType?: string,
): Promise<string> {
  // arnProfileId is set on both create AND update (not just create): every
  // caller in a given ingestion run resolves it from the same batch-wide
  // ARN code (see tenant-resolution.ts's single-ARN-per-batch invariant),
  // so re-asserting it on every upsert is safe and also self-heals any
  // Folio row created before this field was threaded through at all. Same
  // reasoning for rtaType (2026-07-25) — every caller in one ingestion run
  // knows which RTA the batch came from, so re-asserting it self-heals
  // pre-existing rows created before this field existed.
  // schemeName/assetClass only come from MFSD201/CLIENT_AUM records, not
  // investor-master — spread conditionally so an investor-master-only call
  // can't blank out a good value a transaction record already set.
  const extra = {
    ...(schemeName ? { schemeName } : {}),
    ...(assetClass ? { assetClass } : {}),
    ...(rtaType ? { rtaType } : {}),
  };
  const folio = await prisma.folio.upsert({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
    create: { distributorId, clientId, amcCode, folioNumber, schemeCode, arnProfileId, ...extra },
    update: { arnProfileId, ...extra },
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
  schemeName?: string;
  assetClass?: string;
  rtaType?: string;
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
  const { distributorId, arnProfileId, panNumber, investorName, amcCode, folioNumber, schemeCode, schemeName, assetClass, rtaType } =
    params;

  if (panNumber) {
    const client = await prisma.client.upsert({
      where: { distributorId_panNumber: { distributorId, panNumber } },
      create: { distributorId, panNumber, name: investorName ?? "Unknown" },
      update: {},
    });
    const folioId = await upsertFolioRow(
      distributorId,
      client.id,
      amcCode,
      folioNumber,
      schemeCode,
      arnProfileId,
      schemeName,
      assetClass,
      rtaType,
    );
    return { clientId: client.id, folioId };
  }

  const existingFolio = await prisma.folio.findUnique({
    where: { distributorId_amcCode_folioNumber_schemeCode: { distributorId, amcCode, folioNumber, schemeCode } },
  });
  if (existingFolio) {
    const extra = {
      ...(arnProfileId && existingFolio.arnProfileId !== arnProfileId ? { arnProfileId } : {}),
      ...(schemeName ? { schemeName } : {}),
      ...(assetClass ? { assetClass } : {}),
      ...(rtaType ? { rtaType } : {}),
    };
    if (Object.keys(extra).length > 0) {
      await prisma.folio.update({ where: { id: existingFolio.id }, data: extra });
    }
    return { clientId: existingFolio.clientId, folioId: existingFolio.id };
  }
  const client = await prisma.client.create({ data: { distributorId, name: investorName ?? "Unknown" } });
  const folio = await prisma.folio.create({
    data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode, arnProfileId, schemeName, assetClass, rtaType },
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
  address1?: string;
  address2?: string;
  city?: string;
  pincode?: string;
  taxStatus?: string;
  bankAccountNumber?: string;
  bankName?: string;
  rtaType?: string;
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
    address1,
    address2,
    city,
    pincode,
    taxStatus,
    bankAccountNumber,
    bankName,
    rtaType,
  } = params;
  const clientData = {
    name: investorName,
    email: email ?? null,
    phone: mobile ?? null,
    dateOfBirth: dateOfBirth ?? null,
    address1: address1 ?? null,
    address2: address2 ?? null,
    city: city ?? null,
    pincode: pincode ?? null,
    taxStatus: taxStatus ?? null,
    bankAccountNumber: bankAccountNumber ?? null,
    bankName: bankName ?? null,
  };

  if (panNumber) {
    const client = await prisma.client.upsert({
      where: { distributorId_panNumber: { distributorId, panNumber } },
      create: { distributorId, panNumber, ...clientData },
      update: clientData,
    });
    const folioId =
      amcCode && productCode
        ? await upsertFolioRow(distributorId, client.id, amcCode, folioNumber, productCode, arnProfileId, undefined, undefined, rtaType)
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
      const folioExtra = {
        ...(arnProfileId && existingFolio.arnProfileId !== arnProfileId ? { arnProfileId } : {}),
        ...(rtaType ? { rtaType } : {}),
      };
      if (Object.keys(folioExtra).length > 0) {
        await prisma.folio.update({ where: { id: existingFolio.id }, data: folioExtra });
      }
      return { clientId: existingFolio.clientId, folioId: existingFolio.id };
    }
    const client = await prisma.client.create({ data: { distributorId, ...clientData } });
    const folio = await prisma.folio.create({
      data: { distributorId, clientId: client.id, amcCode, folioNumber, schemeCode: productCode, arnProfileId, rtaType },
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

interface FolioKycStatusParams {
  distributorId: string;
  amcCode?: string;
  folioNumber: string;
  kycStatus?: string;
  kycStatusDescription?: string;
  aadhaarStatus?: string;
  reportDate?: Date;
}

/**
 * WBR56's KYC status is folio-number-level, not scheme-level — the report
 * carries no scheme code at all, but a single real folio number can back
 * several of our Folio rows (one per scheme held under it). Updates every
 * Folio row sharing (distributorId, amcCode, folioNumber), not just one.
 * Only enriches EXISTING Folio rows (never creates one) and only if the
 * new report date is newer than what's stored, same "latest known
 * snapshot" guard as updateFolioBalance — a re-run of an older WBR56 file
 * can't regress a fresher status.
 */
export async function updateFolioKycStatus(params: FolioKycStatusParams): Promise<void> {
  const { distributorId, amcCode, folioNumber, kycStatus, kycStatusDescription, aadhaarStatus, reportDate } = params;
  if (!amcCode || !reportDate) {
    return;
  }
  await prisma.$executeRaw`
    UPDATE folios
    SET kyc_status = ${kycStatus ?? null},
        kyc_status_description = ${kycStatusDescription ?? null},
        aadhaar_status = ${aadhaarStatus ?? null},
        kyc_report_date = ${reportDate}
    WHERE distributor_id = ${distributorId}::uuid
      AND amc_code = ${amcCode}
      AND folio_number = ${folioNumber}
      AND (kyc_report_date IS NULL OR kyc_report_date <= ${reportDate})
  `;
}

/**
 * Best-effort Folio link for reports that don't carry a scheme code
 * precise enough to use the normal (amcCode, folioNumber, schemeCode)
 * composite key (WBR95/WBR5 both scope to folio number only) — takes the
 * first matching row across whatever schemes exist under that folio
 * number, purely as a convenience link for the UI to jump to a client.
 * Returns null (never throws) when no match exists, since these reports
 * can reference folios this system hasn't seen yet.
 */
export async function findFolioIdBestEffort(distributorId: string, folioNumber: string, amcCode?: string): Promise<string | null> {
  const folio = await prisma.folio.findFirst({
    where: { distributorId, folioNumber, ...(amcCode ? { amcCode } : {}) },
    select: { id: true },
  });
  return folio?.id ?? null;
}

export interface SchemeMasterUpsertRow {
  amcCode: string;
  amcName?: string;
  schemeCode: string;
  schemeName: string;
  schemeType?: string;
  assetClass?: string;
  sebiClassification?: string;
  isin?: string;
  planType?: string;
  sipAllowed?: boolean;
  swpAllowed?: boolean;
  stpAllowed?: boolean;
  closeEnded?: boolean;
  elssScheme?: boolean;
  minSipAmount?: number;
  minPurchaseAmount?: number;
  faceValue?: number;
  parentSchemeCode?: string;
}

/**
 * Bulk upsert into the GLOBAL SchemeMaster table (no distributorId — see
 * its schema doc comment) via raw SQL, same batched-INSERT-ON-CONFLICT
 * pattern already proven for EquityIsinMaster (Prisma has no native
 * bulk-upsert and thousands of sequential upserts would be too slow for a
 * 7,000+ row report). Follows with a single enrichment UPDATE that
 * backfills any CAMS-sourced Folio row still missing an assetClass —
 * best-effort, since Folio.schemeCode is a per-distributor product code
 * that isn't guaranteed to line up with this report's own SCH_CODE in
 * every case.
 */
export async function upsertSchemeMasterRows(rowsIn: SchemeMasterUpsertRow[]): Promise<number> {
  const BATCH_SIZE = 500;
  let total = 0;
  for (let i = 0; i < rowsIn.length; i += BATCH_SIZE) {
    const batch = rowsIn.slice(i, i + BATCH_SIZE);
    const values = batch.map(
      (r) => Prisma.sql`(
        gen_random_uuid(), ${r.amcCode}, ${r.amcName ?? null}, ${r.schemeCode}, ${r.schemeName},
        ${r.schemeType ?? null}, ${r.assetClass ?? null}, ${r.sebiClassification ?? null}, ${r.isin ?? null},
        ${r.planType ?? null}, ${r.sipAllowed ?? null}, ${r.swpAllowed ?? null}, ${r.stpAllowed ?? null},
        ${r.closeEnded ?? null}, ${r.elssScheme ?? null}, ${r.minSipAmount ?? null}, ${r.minPurchaseAmount ?? null},
        ${r.faceValue ?? null}, ${r.parentSchemeCode ?? null}, now()
      )`,
    );
    const result: unknown[] = await prisma.$queryRaw`
      INSERT INTO scheme_master (
        id, amc_code, amc_name, scheme_code, scheme_name, scheme_type, asset_class, sebi_classification, isin,
        plan_type, sip_allowed, swp_allowed, stp_allowed, close_ended, elss_scheme, min_sip_amount,
        min_purchase_amount, face_value, parent_scheme_code, updated_at
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (amc_code, scheme_code) DO UPDATE SET
        amc_name = EXCLUDED.amc_name,
        scheme_name = EXCLUDED.scheme_name,
        scheme_type = EXCLUDED.scheme_type,
        asset_class = EXCLUDED.asset_class,
        sebi_classification = EXCLUDED.sebi_classification,
        isin = EXCLUDED.isin,
        plan_type = EXCLUDED.plan_type,
        sip_allowed = EXCLUDED.sip_allowed,
        swp_allowed = EXCLUDED.swp_allowed,
        stp_allowed = EXCLUDED.stp_allowed,
        close_ended = EXCLUDED.close_ended,
        elss_scheme = EXCLUDED.elss_scheme,
        min_sip_amount = EXCLUDED.min_sip_amount,
        min_purchase_amount = EXCLUDED.min_purchase_amount,
        face_value = EXCLUDED.face_value,
        parent_scheme_code = EXCLUDED.parent_scheme_code,
        updated_at = now()
      RETURNING id
    `;
    total += result.length;
  }

  await prisma.$executeRaw`
    UPDATE folios f
    SET asset_class = sm.asset_class
    FROM scheme_master sm
    WHERE f.amc_code = sm.amc_code
      AND f.scheme_code = sm.scheme_code
      AND f.rta_type = 'CAMS'
      AND f.asset_class IS NULL
      AND sm.asset_class IS NOT NULL
  `;

  return total;
}
