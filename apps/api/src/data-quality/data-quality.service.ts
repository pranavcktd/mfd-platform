import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Prisma } from "@mfd/db";
import { schemeNameKey } from "@mfd/shared";
import { logAdminAction } from "../admin/audit-log";
import { resolveDisplayAmcName } from "../reports/amc-display-name";
import { findSchemeMatches } from "../reports/scheme-matching";

export type GapType = "NO_ISIN" | "NO_LIVE_NAV_MATCH" | "NO_RTA_TYPE" | "NO_ASSET_CLASS";

/**
 * "Still relevant" filter shared by every gap query — a folio with zero
 * balance and zero valuation will never affect live AUM or capital-gains tax
 * categorization, so excluding it keeps the gap lists focused on folios an
 * admin would actually want to go fix (round 17's real Nippon India/ISIN
 * investigation was driven entirely by folios that still hold real money).
 */
const RELEVANT_FOLIO_FILTER = Prisma.sql`(f.balance_units > 0 OR f.valuation_amount > 0)`;

const GAP_WHERE: Record<GapType, Prisma.Sql> = {
  NO_ISIN: Prisma.sql`f.isin IS NULL AND ${RELEVANT_FOLIO_FILTER}`,
  NO_LIVE_NAV_MATCH: Prisma.sql`f.isin IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM scheme_master sm WHERE sm.isin = f.isin AND sm.latest_nav IS NOT NULL)
    AND ${RELEVANT_FOLIO_FILTER}`,
  NO_RTA_TYPE: Prisma.sql`f.rta_type IS NULL AND ${RELEVANT_FOLIO_FILTER}`,
  NO_ASSET_CLASS: Prisma.sql`f.asset_class IS NULL AND ${RELEVANT_FOLIO_FILTER}`,
};

export interface DataQualitySummaryRow {
  gapType: GapType;
  count: number;
}

export interface DataQualityFolioRow {
  id: string;
  folioNumber: string;
  amcCode: string;
  schemeName: string | null;
  assetClass: string | null;
  isin: string | null;
  rtaType: string | null;
  balanceUnits: string | null;
  valuationAmount: string | null;
  clientName: string;
  distributorName: string;
}

export interface SchemeSuggestion {
  schemeMasterId: string;
  amcCode: string;
  amcName: string | null;
  schemeCode: string;
  schemeName: string;
  isin: string | null;
  latestNav: string | null;
  score: number;
}

export interface SiblingFolio {
  id: string;
  folioNumber: string;
  clientName: string;
  distributorName: string;
}

export interface ApplyCorrectionResult {
  id: string;
  siblingFolios: SiblingFolio[];
  /** The full field set actually applied, including any inferred rtaType — the caller (frontend) passes this whole set to bulk-apply, not just the field it originally sent, so siblings get the inference too. */
  appliedFields: CorrectionFields;
}

type CorrectionFields = { isin?: string; assetClass?: string; rtaType?: string };

/** Which Folio column a given field maps to, and the "still has this gap" predicate used both to find siblings and to gate auto-apply during ingestion. */
const FIELD_TO_GAP_WHERE: Record<keyof CorrectionFields, Prisma.Sql> = {
  isin: Prisma.sql`f.isin IS NULL`,
  assetClass: Prisma.sql`f.asset_class IS NULL`,
  rtaType: Prisma.sql`f.rta_type IS NULL`,
};

@Injectable()
export class DataQualityService {
  /** Counts per gap type, across all tenants — this is a super-admin-only module (data gaps are a platform/ingestion concern, not a single MFD's business data). */
  async getSummary(distributorId?: string): Promise<DataQualitySummaryRow[]> {
    const tenantFilter = distributorId ? Prisma.sql`AND f.distributor_id = ${distributorId}::uuid` : Prisma.empty;
    const gapTypes = Object.keys(GAP_WHERE) as GapType[];
    const counts = await Promise.all(
      gapTypes.map(async (gapType) => {
        const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint as count FROM folios f WHERE ${GAP_WHERE[gapType]} ${tenantFilter}
        `;
        return { gapType, count: Number(rows[0]?.count ?? 0) };
      }),
    );
    return counts;
  }

  async listGaps(gapType: GapType, distributorId?: string, limit = 200): Promise<DataQualityFolioRow[]> {
    const tenantFilter = distributorId ? Prisma.sql`AND f.distributor_id = ${distributorId}::uuid` : Prisma.empty;
    return prisma.$queryRaw<DataQualityFolioRow[]>`
      SELECT
        f.id,
        f.folio_number as "folioNumber",
        f.amc_code as "amcCode",
        f.scheme_name as "schemeName",
        f.asset_class as "assetClass",
        f.isin,
        f.rta_type as "rtaType",
        f.balance_units::text as "balanceUnits",
        f.valuation_amount::text as "valuationAmount",
        c.name as "clientName",
        d.name as "distributorName"
      FROM folios f
      JOIN clients c ON c.id = f.client_id
      JOIN distributors d ON d.id = f.distributor_id
      WHERE ${GAP_WHERE[gapType]} ${tenantFilter}
      ORDER BY f.valuation_amount DESC NULLS LAST
      LIMIT ${limit}
    `;
  }

  /**
   * Fuzzy scheme candidates for one folio — delegates to the shared
   * `findSchemeMatches` (see scheme-matching.ts for the full ranking
   * rationale: core-name similarity, AMC boost, Direct/IDCW penalties, all
   * tuned against real misranked cases). The folio's real AMC name is
   * resolved via `resolveDisplayAmcName` (the same KFintech-code/CAS-prefix/
   * scheme-name heuristic logic used everywhere else in this codebase, not
   * a new guess) before being passed in as the boost hint.
   */
  async getSuggestions(folioId: string, limit = 5): Promise<SchemeSuggestion[]> {
    const folio = await prisma.folio.findUnique({
      where: { id: folioId },
      select: { schemeName: true, amcCode: true, rtaType: true },
    });
    if (!folio) throw new NotFoundException("Folio not found");
    if (!folio.schemeName) return [];

    const amcName = resolveDisplayAmcName(folio.schemeName, folio.amcCode, folio.rtaType);
    const amcNameLikelyResolved = !amcName.startsWith("AMC Code ");
    return findSchemeMatches(folio.schemeName, amcNameLikelyResolved ? amcName : undefined, limit);
  }

  /**
   * Manual admin correction — direct write, no COALESCE (an explicit human
   * choice always wins over "don't overwrite a good value" caution).
   * Also: (0) infers rtaType from the ISIN itself when it's still unknown
   * (below), (1) remembers the correction as a SchemeCorrectionRule keyed by
   * (amcCode, scheme name) so it auto-applies to future ingestion of the
   * same scheme (see crm-sync.ts's upsertFolioRow), and (2) finds every
   * OTHER existing folio — across every MFD, not just this one, since a
   * scheme's ISIN/asset-class/RTA is real-world fact, not tenant-specific —
   * sharing the same (amcCode, scheme name) that still has the identical
   * gap, so the caller can offer a one-click "fix all of these too."
   */
  async applyCorrection(folioId: string, fields: CorrectionFields): Promise<ApplyCorrectionResult> {
    const folio = await prisma.folio.findUnique({
      where: { id: folioId },
      select: { id: true, distributorId: true, amcCode: true, schemeName: true, rtaType: true },
    });
    if (!folio) throw new NotFoundException("Folio not found");

    // Knowing the real ISIN tells us the real scheme, and scheme_master's
    // own row for it already reveals which RTA it came through: a row with
    // amc_code "AMFI" only exists because nav-sync.processor.ts inserted it
    // from AMFI's own file — meaning CAMS's WBR39 report never had this
    // scheme, meaning CAMS doesn't service this AMC (round 17's real
    // Nippon-India finding), so since every folio necessarily came from one
    // of exactly two RTAs, it must be KFintech. Any other amc_code is a
    // real WBR39/CAMS row, so the scheme is CAMS-serviced. Never overrides
    // an already-known rtaType — only fills a genuine unknown.
    const effectiveFields = { ...fields };
    if (effectiveFields.isin !== undefined && effectiveFields.rtaType === undefined && !folio.rtaType) {
      const schemeRow = await prisma.schemeMaster.findFirst({
        where: { isin: effectiveFields.isin },
        select: { amcCode: true },
      });
      if (schemeRow) {
        effectiveFields.rtaType = schemeRow.amcCode === "AMFI" ? "KFINTECH" : "CAMS";
      }
    }

    const data: Prisma.FolioUpdateInput = {};
    if (effectiveFields.isin !== undefined) data.isin = effectiveFields.isin;
    if (effectiveFields.assetClass !== undefined) data.assetClass = effectiveFields.assetClass;
    if (effectiveFields.rtaType !== undefined) data.rtaType = effectiveFields.rtaType;

    const updated = await prisma.folio.update({ where: { id: folioId }, data });
    await logAdminAction("DATA_QUALITY_MANUAL_FIX", folio.distributorId, { folioId, ...effectiveFields });

    let siblingFolios: SiblingFolio[] = [];
    if (folio.schemeName) {
      const key = schemeNameKey(folio.schemeName);
      await prisma.schemeCorrectionRule.upsert({
        where: { amcCode_schemeNameKey: { amcCode: folio.amcCode, schemeNameKey: key } },
        create: { amcCode: folio.amcCode, schemeNameKey: key, ...effectiveFields },
        update: { ...effectiveFields },
      });

      const gapClauses = (Object.keys(effectiveFields) as Array<keyof CorrectionFields>)
        .filter((f) => effectiveFields[f] !== undefined)
        .map((f) => FIELD_TO_GAP_WHERE[f]);
      if (gapClauses.length > 0) {
        // Two ways a sibling folio can match: (1) its own scheme name
        // normalizes to the identical key (safe, exact — same normalization
        // as the stored rule), or (2) same AMC + high trigram similarity to
        // THIS folio's real scheme name, a broader net for near-duplicates
        // normalization alone won't catch (typos, an extra/missing word).
        // Safe to be generous here since a human reviews the list before
        // "fix all" actually applies anything.
        //
        // OR'd (not AND'd) across every field being set: a sibling only
        // needs to be missing AT LEAST ONE of them. A previous version
        // required ALL fields to be missing, which silently excluded real
        // siblings whenever the current fix also inferred rtaType (see
        // above) — most siblings of a scheme already have a correct
        // rtaType from earlier ingestion, so requiring both to be missing
        // meant "sometimes the sibling prompt appears, sometimes it
        // doesn't" depending on whether THIS ONE folio happened to also be
        // missing rtaType. bulkApply below is now COALESCE-based
        // specifically so it's safe to be broad here again — it fills only
        // what's actually missing per sibling, never overwrites a good
        // value even when applying the same field set to many folios at
        // once.
        siblingFolios = await prisma.$queryRaw<SiblingFolio[]>`
          SELECT f.id, f.folio_number as "folioNumber", c.name as "clientName", d.name as "distributorName"
          FROM folios f
          JOIN clients c ON c.id = f.client_id
          JOIN distributors d ON d.id = f.distributor_id
          WHERE f.amc_code = ${folio.amcCode}
            AND f.id != ${folioId}::uuid
            AND (${Prisma.join(gapClauses, " OR ")})
            AND (
              regexp_replace(regexp_replace(lower(trim(f.scheme_name)), '\\s*-\\s*', '-', 'g'), '\\s+', ' ', 'g') = ${key}
              OR similarity(f.scheme_name, ${folio.schemeName}) > 0.82
            )
          LIMIT 500
        `;
      }
    }

    return { id: updated.id, siblingFolios, appliedFields: effectiveFields };
  }

  /**
   * Applies the given fields to a batch of folios in one go — the "fix all
   * of these too" action, using the folio IDs the earlier applyCorrection
   * call already identified as siblings (which, since round 21, only
   * requires a sibling to be missing AT LEAST ONE of the fields, not all —
   * see applyCorrection's sibling query). COALESCE-based specifically
   * because of that: a sibling in the list might already have a perfectly
   * good rtaType and only need isin, so this must only fill genuine NULLs
   * per folio, never blindly overwrite a value that's already there.
   */
  async bulkApply(folioIds: string[], fields: CorrectionFields): Promise<{ fixed: number }> {
    if (folioIds.length === 0) return { fixed: 0 };
    const setClauses: Prisma.Sql[] = [];
    if (fields.isin !== undefined) setClauses.push(Prisma.sql`isin = COALESCE(isin, ${fields.isin})`);
    if (fields.assetClass !== undefined) setClauses.push(Prisma.sql`asset_class = COALESCE(asset_class, ${fields.assetClass})`);
    if (fields.rtaType !== undefined) setClauses.push(Prisma.sql`rta_type = COALESCE(rta_type, ${fields.rtaType})`);
    if (setClauses.length === 0) return { fixed: 0 };

    const result: unknown[] = await prisma.$queryRaw`
      UPDATE folios
      SET ${Prisma.join(setClauses, ", ")}
      WHERE id = ANY(${folioIds}::uuid[])
      RETURNING id
    `;
    await logAdminAction("DATA_QUALITY_BULK_FIX", undefined, { folioIds, ...fields, fixed: result.length });
    return { fixed: result.length };
  }
}
