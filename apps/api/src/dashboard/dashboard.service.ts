import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { resolveAmcName } from "@mfd/shared";
import { TenantContext } from "../tenant/tenant-context";
import { monthlyEquivalentAmount } from "../reports/sip-frequency";

const RECENT_CLIENTS_PAGE_SIZE = 10;

@Injectable()
export class DashboardService {
  /**
   * requestedArnProfileIds is untrusted request input — always intersected
   * against the tenant's own ArnProfile rows (never trusted to already
   * belong to this distributor) before it's used to scope any query. An
   * empty intersection (every requested id was invalid/foreign) returns a
   * zeroed summary rather than silently falling back to "all ARNs", so a
   * bad filter reads as "no data" instead of leaking the unfiltered view.
   */
  async getSummary(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();

    let arnScope: string[] | undefined;
    if (requestedArnProfileIds && requestedArnProfileIds.length > 0) {
      const owned = await prisma.arnProfile.findMany({
        where: { distributorId, id: { in: requestedArnProfileIds } },
        select: { id: true },
      });
      arnScope = owned.map((a) => a.id);
      if (arnScope.length === 0) {
        return this.emptySummary();
      }
    }

    const folioWhere = { distributorId, ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) };
    // registrationType: "SIP" is required, not optional — real bug fixed
    // 2026-08-12: before SipRegistration.registrationType existed, this
    // blended active STP/SWP registrations in under the Dashboard's own
    // "Active SIPs"/"Monthly SIP Value" tiles too. See reports.service.ts's
    // getRegistrationReport doc comment.
    const sipWhere = {
      distributorId,
      registrationType: "SIP" as const,
      isActive: true,
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };

    const scopedClientIds = arnScope
      ? (
          await prisma.folio.findMany({
            where: folioWhere,
            select: { clientId: true },
            distinct: ["clientId"],
          })
        ).map((r) => r.clientId)
      : undefined;
    const clientWhere = scopedClientIds ? { id: { in: scopedClientIds } } : { distributorId };

    const [
      totalAumRows,
      classifiedAumRows,
      liveAumRows,
      totalClients,
      nonPanClients,
      activeSipRegistrations,
      activeSipCount,
      topAmcRows,
      topClientRows,
      lastRtaImports,
      navSyncLog,
      navValueDateRow,
    ] = await Promise.all([
      // COALESCE(valuation_amount, estimated_valuation_amount): a folio
      // that's never received an RTA balance report contributes its
      // transaction-replay estimate instead of silently vanishing from
      // Total AUM (real confirmed gap — see Folio.estimatedValuationAmount's
      // doc comment). Never overrides a real valuation_amount when present.
      prisma.$queryRaw<Array<{ totalAum: string | null }>>`
        SELECT SUM(COALESCE(f.valuation_amount, f.estimated_valuation_amount))::text AS "totalAum"
        FROM folios f
        WHERE f.distributor_id = ${distributorId}::uuid
          ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
      `,
      // "Unclassified AUM" — same definition Analysis already uses
      // (analysis.service.ts): AUM whose folio has no assetClass captured
      // (RTA's SCHEME_TYP/AssetType field never populated for it), computed
      // here too rather than making the dashboard fetch a whole separate
      // Analysis summary just for this one figure.
      prisma.$queryRaw<Array<{ classifiedAum: string | null }>>`
        SELECT SUM(COALESCE(f.valuation_amount, f.estimated_valuation_amount))::text AS "classifiedAum"
        FROM folios f
        WHERE f.distributor_id = ${distributorId}::uuid AND f.asset_class IS NOT NULL
          ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
      `,
      // Independently derived from today's real AMFI NAV × each folio's
      // last-known unit balance (falling back to the transaction-replay
      // estimate when there's no RTA balance report — same COALESCE as
      // totalAum above) — not the RTA's own (often weeks-stale)
      // valuationAmount snapshot. Only sums folios whose scheme has been
      // matched to a live NAV (see nav-sync.processor.ts / Folio.isin);
      // NULL (not 0) when none have, so the frontend can distinguish
      // "genuinely zero" from "no live data yet".
      prisma.$queryRaw<Array<{ liveAum: string | null }>>`
        SELECT SUM(COALESCE(f.balance_units, f.estimated_balance_units) * sm.latest_nav)::text AS "liveAum"
        FROM folios f
        JOIN scheme_master sm ON sm.isin = f.isin AND sm.latest_nav IS NOT NULL
        WHERE f.distributor_id = ${distributorId}::uuid
          ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
      `,
      prisma.client.count({ where: clientWhere }),
      prisma.client.count({ where: { ...clientWhere, panNumber: null } }),
      prisma.sipRegistration.findMany({ where: sipWhere, select: { sipAmount: true, frequency: true } }),
      prisma.sipRegistration.count({ where: sipWhere }),
      // valuationAmount: { not: null } matters here, not just for a clean
      // query: Postgres sorts NULL first in a DESC ORDER BY by default, so
      // without this filter, clients/AMCs with zero AUM data (a NULL SUM)
      // outrank every client that actually has a balance — confirmed live,
      // topClients came back as five clients all showing "0".
      prisma.folio.groupBy({
        by: ["amcCode"],
        where: { ...folioWhere, valuationAmount: { not: null } },
        _sum: { valuationAmount: true },
        orderBy: { _sum: { valuationAmount: "desc" } },
        take: 5,
      }),
      prisma.folio.groupBy({
        by: ["clientId"],
        where: { ...folioWhere, valuationAmount: { not: null } },
        _sum: { valuationAmount: true },
        orderBy: { _sum: { valuationAmount: "desc" } },
        take: 5,
      }),
      // Most recent successfully-processed mail, PER RTA type (CAMS and
      // KFintech run on independent schedules/mailboxes and can be out of
      // sync with each other) — updatedAt (not receivedAt) is when it
      // actually finished moving through ingestion->decryption->
      // schema-mapping to COMPLETED, which is what "when was data last
      // imported" really means (receivedAt can predate that by however
      // long the pipeline took to process it).
      this.getLastRtaImports(distributorId, arnScope),
      // NAV sync is platform-wide (one shared AMFI file for every tenant),
      // not distributor-scoped — when we last successfully fetched it.
      prisma.navSyncLog.findFirst({
        where: { syncType: "DAILY", status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
      // The NAV *value* date embedded in that file (what date's price is
      // actually live right now) — distinct from when we fetched it, since
      // AMFI sometimes serves the prior day's file for a few hours before
      // publishing the new one.
      prisma.schemeMaster.aggregate({ _max: { latestNavDate: true } }),
    ]);

    const topClientIds = topClientRows.map((r) => r.clientId);
    const topClientNames = await prisma.client.findMany({
      where: { id: { in: topClientIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(topClientNames.map((c) => [c.id, c.name]));

    // resolveAmcName derives the real AMC display name (e.g. "Axis Mutual
    // Fund") from a sample scheme name for each amcCode — amcCode itself is
    // just a short RTA-internal code, not a display-ready name (see
    // amc-names.ts doc comment).
    const sampleNames = await prisma.folio.findMany({
      where: { ...folioWhere, amcCode: { in: topAmcRows.map((r) => r.amcCode) }, schemeName: { not: null } },
      distinct: ["amcCode"],
      select: { amcCode: true, schemeName: true },
    });
    const schemeNameByAmc = new Map(sampleNames.map((s) => [s.amcCode, s.schemeName]));

    const [dayChangeAum, monthChangeAum] = await Promise.all([
      this.computeAumChange(distributorId, arnScope, 1),
      this.computeAumChange(distributorId, arnScope, 30),
    ]);

    const totalAum = Number(totalAumRows[0]?.totalAum ?? 0);
    const classifiedAum = Number(classifiedAumRows[0]?.classifiedAum ?? 0);
    // Same near-zero clamp Analysis uses — a floating-point subtraction of
    // two large near-equal sums can land on a tiny artifact instead of 0.
    const unclassifiedAum = Math.abs(totalAum - classifiedAum) < 1 ? 0 : totalAum - classifiedAum;

    return {
      totalAum: totalAumRows[0]?.totalAum ?? "0",
      liveAum: liveAumRows[0]?.liveAum ?? null,
      unclassifiedAum: unclassifiedAum.toString(),
      dayChangeAum,
      monthChangeAum,
      lastRtaImports,
      navStatus: { valueDate: navValueDateRow._max.latestNavDate, syncedAt: navSyncLog?.completedAt ?? null },
      totalClients,
      nonPanClients,
      // Monthly-equivalent, not a raw sum — a quarterly SIP's full
      // installment isn't "this month's" value (see monthlyEquivalentAmount).
      monthlySipValue: activeSipRegistrations
        .reduce((sum, s) => sum + monthlyEquivalentAmount(Number(s.sipAmount ?? 0), s.frequency), 0)
        .toFixed(2),
      activeSips: activeSipCount,
      topAmcs: topAmcRows.map((r) => ({
        amcCode: r.amcCode,
        amcName: resolveAmcName(schemeNameByAmc.get(r.amcCode), r.amcCode),
        aum: r._sum.valuationAmount?.toString() ?? "0",
      })),
      topClients: topClientRows.map((r) => ({
        name: nameById.get(r.clientId) ?? "Unknown",
        aum: r._sum.valuationAmount?.toString() ?? "0",
      })),
    };
  }

  private emptySummary() {
    const emptyChange = { amount: null, percent: null, asOfDate: null, coveragePercent: null };
    return {
      totalAum: "0",
      liveAum: null,
      unclassifiedAum: "0",
      dayChangeAum: emptyChange,
      monthChangeAum: emptyChange,
      lastRtaImports: [],
      navStatus: { valueDate: null, syncedAt: null },
      totalClients: 0,
      nonPanClients: 0,
      monthlySipValue: "0",
      activeSips: 0,
      topAmcs: [],
      topClients: [],
    };
  }

  /**
   * Latest successfully-COMPLETED mail per RTA type actually seen for this
   * distributor (not hardcoded to CAMS/KFintech, so a future RTA type shows
   * up automatically) — CAMS and KFintech are independent mailboxes/reports
   * and can genuinely be out of sync with each other, so a single combined
   * "last import" figure would hide one RTA silently falling behind.
   */
  private async getLastRtaImports(distributorId: string, arnScope: string[] | undefined) {
    const rtaTypes = await prisma.mailIngestionLog.findMany({
      where: { distributorId, ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
      distinct: ["rtaType"],
      select: { rtaType: true },
    });

    const results = await Promise.all(
      rtaTypes.map(async ({ rtaType }) => {
        const log = await prisma.mailIngestionLog.findFirst({
          where: { distributorId, rtaType, status: "COMPLETED", ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
          orderBy: { updatedAt: "desc" },
          select: { receivedAt: true, updatedAt: true },
        });
        return { rtaType, receivedAt: log?.receivedAt ?? null, importedAt: log?.updatedAt ?? null };
      }),
    );
    return results.sort((a, b) => a.rtaType.localeCompare(b.rtaType));
  }

  /**
   * PAN/folio/scheme-wise detail behind the dashboard's "Unclassified AUM"
   * tile — every folio with a real reported value but no assetClass
   * captured from the RTA. Same folioWhere scoping (distributor + optional
   * ARN filter) as getSummary, kept as its own on-demand call rather than
   * always embedding the full list in the summary payload.
   */
  async getUnclassifiedFolios(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    let arnScope: string[] | undefined;
    if (requestedArnProfileIds && requestedArnProfileIds.length > 0) {
      const owned = await prisma.arnProfile.findMany({
        where: { distributorId, id: { in: requestedArnProfileIds } },
        select: { id: true },
      });
      arnScope = owned.map((a) => a.id);
      if (arnScope.length === 0) return [];
    }

    const folios = await prisma.folio.findMany({
      where: {
        distributorId,
        assetClass: null,
        ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      },
      orderBy: { valuationAmount: "desc" },
      select: {
        id: true,
        folioNumber: true,
        amcCode: true,
        schemeCode: true,
        schemeName: true,
        valuationAmount: true,
        client: { select: { id: true, name: true, panNumber: true } },
      },
    });

    return folios.map((f) => ({
      folioId: f.id,
      clientId: f.client.id,
      clientName: f.client.name,
      panNumber: f.client.panNumber,
      folioNumber: f.folioNumber,
      amcCode: f.amcCode,
      schemeCode: f.schemeCode,
      schemeName: f.schemeName,
      valuationAmount: f.valuationAmount?.toString() ?? "0",
    }));
  }

  /**
   * AUM change vs. N calendar days ago — compares today's live AUM (today's
   * AMFI NAV × last-known units) against the same folios' value using the
   * nearest real historical AMFI NAV on or before the target date (AMFI
   * doesn't publish on weekends/holidays, so this is never a hard match on
   * the exact calendar date). Only over folios matched on BOTH ends (a real
   * ISIN, today's live NAV, AND a historical NAV point) so the two totals
   * are directly comparable — a folio added yesterday can't fake a
   * "change" just by existing on one side and not the other. Each ISIN's
   * historical match is capped to within NAV_MATCH_TOLERANCE_DAYS of the
   * target — without this, a scheme with a gap in backfilled history (e.g.
   * asking for "90 days ago" when only the last 35 days were backfilled)
   * would silently fall back to whatever much-older NAV happens to exist
   * (confirmed live: a 90-day request matched a 17-month-old row and
   * produced a fabricated-looking "+179%"), which is a wrong number, not a
   * conservative one. Returns null fields (not a fabricated 0%) when there
   * isn't yet enough backfilled/accumulated NAV history to answer — see
   * nav-history-backfill.processor.ts.
   */
  private async computeAumChange(distributorId: string, arnScope: string[] | undefined, daysAgo: number) {
    const NAV_MATCH_TOLERANCE_DAYS = 10;
    const targetDate = new Date();
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const earliestAcceptableDate = new Date(targetDate);
    earliestAcceptableDate.setUTCDate(earliestAcceptableDate.getUTCDate() - NAV_MATCH_TOLERANCE_DAYS);

    const rows = await prisma.$queryRaw<
      Array<{ todayAum: string | null; histAum: string | null; histDate: Date | null }>
    >`
      SELECT
        SUM(COALESCE(f.balance_units, f.estimated_balance_units) * sm.latest_nav)::text AS "todayAum",
        SUM(COALESCE(f.balance_units, f.estimated_balance_units) * h.nav)::text AS "histAum",
        MAX(h.nav_date) AS "histDate"
      FROM folios f
      JOIN scheme_master sm ON sm.isin = f.isin AND sm.latest_nav IS NOT NULL
      JOIN LATERAL (
        SELECT nav, nav_date FROM scheme_nav_history snh
        WHERE snh.isin = f.isin AND snh.nav_date <= ${targetDate}::date AND snh.nav_date >= ${earliestAcceptableDate}::date
        ORDER BY snh.nav_date DESC
        LIMIT 1
      ) h ON true
      WHERE f.distributor_id = ${distributorId}::uuid
        ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
    `;

    const row = rows[0];
    const today = row?.todayAum !== null && row?.todayAum !== undefined ? Number(row.todayAum) : null;
    const hist = row?.histAum !== null && row?.histAum !== undefined ? Number(row.histAum) : null;
    if (today === null || hist === null || hist === 0) {
      return { amount: null, percent: null, asOfDate: null, coveragePercent: null };
    }

    // Coverage against the same live-NAV-matched universe liveAum already
    // uses, so the caveat reflects "how much of what CAN have a live price
    // is also covered by history" — not diluted by folios with no ISIN at all.
    const liveTotalRows = await prisma.$queryRaw<Array<{ liveAum: string | null }>>`
      SELECT SUM(COALESCE(f.balance_units, f.estimated_balance_units) * sm.latest_nav)::text AS "liveAum"
      FROM folios f
      JOIN scheme_master sm ON sm.isin = f.isin AND sm.latest_nav IS NOT NULL
      WHERE f.distributor_id = ${distributorId}::uuid
        ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
    `;
    const liveTotal = Number(liveTotalRows[0]?.liveAum ?? 0);
    const coveragePercent = liveTotal > 0 ? ((today / liveTotal) * 100).toFixed(1) : null;

    return {
      amount: (today - hist).toFixed(2),
      percent: ((today - hist) / hist * 100).toFixed(2),
      asOfDate: row?.histDate ?? null,
      coveragePercent,
    };
  }

  /** Same AUM-change computation as the dashboard's default Day/Month cards, exposed with an arbitrary look-back so the frontend can offer a custom date-range filter beyond the two defaults. */
  async getAumChange(days: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    let arnScope: string[] | undefined;
    if (requestedArnProfileIds && requestedArnProfileIds.length > 0) {
      const owned = await prisma.arnProfile.findMany({
        where: { distributorId, id: { in: requestedArnProfileIds } },
        select: { id: true },
      });
      arnScope = owned.map((a) => a.id);
      if (arnScope.length === 0) {
        return { amount: null, percent: null, asOfDate: null, coveragePercent: null };
      }
    }
    return this.computeAumChange(distributorId, arnScope, days);
  }

  /**
   * Paginated "recently added clients" — deliberately split out of
   * getSummary (which used to embed a fixed top-5 slice augmented with an
   * unrelated "latest transaction" field, muddling "when this client
   * record was added" with "what they last did" — a real user-reported
   * confusion). Shows the real onboarding date and which ARN(s) the
   * client's folios are attributed to, paginated so the full addition
   * history is actually reachable, not just the last handful.
   */
  async getRecentClients(requestedArnProfileIds: string[] | undefined, page: number) {
    const distributorId = TenantContext.currentDistributorId();

    let arnScope: string[] | undefined;
    if (requestedArnProfileIds && requestedArnProfileIds.length > 0) {
      const owned = await prisma.arnProfile.findMany({
        where: { distributorId, id: { in: requestedArnProfileIds } },
        select: { id: true },
      });
      arnScope = owned.map((a) => a.id);
      if (arnScope.length === 0) {
        return { total: 0, page, pageSize: RECENT_CLIENTS_PAGE_SIZE, clients: [] };
      }
    }

    const arnJoinFilter = arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty;
    const joinType = arnScope ? Prisma.sql`JOIN` : Prisma.sql`LEFT JOIN`;

    const clients = await prisma.$queryRaw<
      Array<{ id: string; name: string; panNumber: string | null; createdAt: Date; arnNumbers: string[] | null }>
    >`
      SELECT c.id, c.name, c.pan_number AS "panNumber", c.created_at AS "createdAt",
             array_agg(DISTINCT a.arn_number) FILTER (WHERE a.arn_number IS NOT NULL) AS "arnNumbers"
      FROM clients c
      ${joinType} folios f ON f.client_id = c.id ${arnJoinFilter}
      LEFT JOIN arn_profiles a ON a.id = f.arn_profile_id
      WHERE c.distributor_id = ${distributorId}::uuid AND c.merged_into_client_id IS NULL
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ${RECENT_CLIENTS_PAGE_SIZE} OFFSET ${(page - 1) * RECENT_CLIENTS_PAGE_SIZE}
    `;

    const [{ count: total }] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM clients c
      ${joinType} folios f ON f.client_id = c.id ${arnJoinFilter}
      WHERE c.distributor_id = ${distributorId}::uuid AND c.merged_into_client_id IS NULL
    `;

    return {
      total,
      page,
      pageSize: RECENT_CLIENTS_PAGE_SIZE,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
        arnNumbers: c.arnNumbers ?? [],
      })),
    };
  }
}
