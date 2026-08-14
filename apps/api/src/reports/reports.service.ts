import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { resolveAmcName, computeXirr } from "@mfd/shared";
import { TenantContext } from "../tenant/tenant-context";
import {
  computeFifoRealizedGains,
  computeFifoUnrealizedGain,
  classifyAssetTaxCategory,
  fetchGrandfatherNavByIsin,
  type AssetTaxCategory,
  type GainClassification,
} from "./capital-gains";
import { fetchLatestNavByIsin, computeLiveValue } from "./live-valuation";
import { estimateNextDueDate, monthlyEquivalentAmount, normalizeFrequencyKey } from "./sip-frequency";

const PAGE_SIZE = 25;

@Injectable()
export class ReportsService {
  /**
   * requestedArnProfileIds is untrusted request input on every report below
   * — always re-intersected against the tenant's own ArnProfile rows here,
   * never trusted as-is (same pattern as DashboardService/AnalysisService).
   * Returns undefined for "no filter" (every query below leaves its
   * arnProfileId condition out entirely in that case) vs a real array
   * (possibly empty, which Prisma's `in: []` correctly resolves to zero
   * rows) once a filter is actually requested.
   */
  private async resolveArnScope(requestedArnProfileIds?: string[]): Promise<string[] | undefined> {
    if (!requestedArnProfileIds || requestedArnProfileIds.length === 0) {
      return undefined;
    }
    const distributorId = TenantContext.currentDistributorId();
    const owned = await prisma.arnProfile.findMany({
      where: { distributorId, id: { in: requestedArnProfileIds } },
      select: { id: true },
    });
    return owned.map((a) => a.id);
  }

  /** Distributor report: AUM broken down by AMC (full list, not just the dashboard's top 5), with a resolved AMC display name (see resolveAmcName) rather than the bare RTA scheme code. */
  async getAumReport(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = { distributorId, valuationAmount: { not: null }, ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) };
    const rows = await prisma.folio.groupBy({
      by: ["amcCode"],
      where,
      _sum: { valuationAmount: true },
      _count: true,
      orderBy: { _sum: { valuationAmount: "desc" } },
    });

    const sampleNames = await prisma.folio.findMany({
      where: { distributorId, amcCode: { in: rows.map((r) => r.amcCode) }, schemeName: { not: null } },
      distinct: ["amcCode"],
      select: { amcCode: true, schemeName: true },
    });
    const nameByAmc = new Map(sampleNames.map((s) => [s.amcCode, s.schemeName]));

    return rows.map((r) => ({
      amcCode: r.amcCode,
      amcName: resolveAmcName(nameByAmc.get(r.amcCode), r.amcCode),
      folioCount: r._count,
      aum: r._sum.valuationAmount?.toString() ?? "0",
    }));
  }

  /** Distributor report: transaction register, filterable by type and date range. */
  async getTransactionsReport(params: { type?: string; from?: string; to?: string; page: number; arnProfileIds?: string[] }) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(params.arnProfileIds);
    const where = {
      distributorId,
      ...(params.type ? { transactionType: params.type } : {}),
      ...(params.from || params.to
        ? {
            transactionDate: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to ? { lte: new Date(params.to) } : {}),
            },
          }
        : {}),
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          folio: {
            select: { folioNumber: true, amcCode: true, schemeCode: true, schemeName: true, client: { select: { name: true } } },
          },
        },
      }),
    ]);

    return {
      total,
      page: params.page,
      pageSize: PAGE_SIZE,
      transactions: transactions.map((t) => ({
        id: t.id,
        clientName: t.folio.client.name,
        folioNumber: t.folio.folioNumber,
        amcCode: t.folio.amcCode,
        schemeCode: t.folio.schemeCode,
        schemeName: t.folio.schemeName,
        transactionType: t.transactionType,
        transactionDescription: t.transactionDescription,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
        brokerageAmount: t.brokerageAmount?.toString() ?? null,
        isRejection: t.isRejection,
        source: t.source,
      })),
    };
  }

  /**
   * Distributor reports: SIP/STP/SWP registrations, filterable by lifecycle
   * status — one shared query behind three thin type-scoped wrappers.
   *
   * Real bug fixed 2026-08-12: before `SipRegistration.registrationType`
   * existed, this method (and getSipDueReport/getSipBreakdown/
   * getSipExplorer/getSipExpiringReport below) had no way to tell a SIP
   * registration apart from an STP or SWP one, so every one of them
   * silently blended all three under the "SIP" label — e.g. the live
   * "Active SIP Value" dashboard stat was counting 899 active
   * SIP+STP+SWP registrations combined as if all 899 were SIPs, when only
   * 831 actually are. Now that registrationType is populated (backfilled
   * from real WBR49/MFSD243 data — see mapSipRegistrationRecord), every one
   * of these methods filters to its own type explicitly.
   *
   * Also replaces the OLD `getStpReport`/`getSwpReport`, which used to
   * derive STP/SWP from raw Transaction history (every SWITCH_IN/OUT =
   * "STP", every REDEMPTION = "SWP") because no dedicated registration feed
   * was ingested yet — self-documented at the time as an approximation
   * ("a one-off manual switch/redemption is indistinguishable from a
   * systematic one in this data"). That's no longer true: WBR49/MFSD243
   * carry the RTA's own STP/SWP mandate records directly, so this is
   * strictly more accurate than the transaction-heuristic version was.
   */
  private async getRegistrationReport(
    registrationType: "SIP" | "STP" | "SWP",
    status: "new" | "active" | "ceased" | undefined,
    page: number,
    requestedArnProfileIds?: string[],
  ) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const where = {
      distributorId,
      registrationType,
      ...(status === "new" ? { registrationDate: { gte: startOfMonth } } : {}),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "ceased" ? { isActive: false } : {}),
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };

    const [total, sips] = await Promise.all([
      prisma.sipRegistration.count({ where }),
      prisma.sipRegistration.findMany({
        where,
        orderBy: { registrationDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { folio: { select: { folioNumber: true, amcCode: true, schemeName: true, client: { select: { name: true } } } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      sips: sips.map((s) => ({
        id: s.id,
        clientName: s.folio.client.name,
        folioNumber: s.folio.folioNumber,
        amcCode: s.folio.amcCode,
        schemeCode: s.schemeCode,
        schemeName: s.folio.schemeName,
        sipAmount: s.sipAmount?.toString() ?? null,
        frequency: s.frequency,
        registrationDate: s.registrationDate,
        startDate: s.startDate,
        endDate: s.endDate,
        ceaseDate: s.ceaseDate,
        isActive: s.isActive,
      })),
    };
  }

  async getSipReport(status: "new" | "active" | "ceased" | undefined, page: number, requestedArnProfileIds?: string[]) {
    return this.getRegistrationReport("SIP", status, page, requestedArnProfileIds);
  }

  async getStpReport(status: "new" | "active" | "ceased" | undefined, page: number, requestedArnProfileIds?: string[]) {
    return this.getRegistrationReport("STP", status, page, requestedArnProfileIds);
  }

  async getSwpReport(status: "new" | "active" | "ceased" | undefined, page: number, requestedArnProfileIds?: string[]) {
    return this.getRegistrationReport("SWP", status, page, requestedArnProfileIds);
  }

  /** Client report: per-folio holdings, optionally scoped to one client. */
  async getHoldingsReport(clientId: string | undefined, page: number, requestedArnProfileIds?: string[], search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = {
      distributorId,
      ...(clientId ? { clientId } : {}),
      ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      ...(search ? { client: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } : {}),
    };

    const [total, folios] = await Promise.all([
      prisma.folio.count({ where }),
      prisma.folio.findMany({
        where,
        orderBy: { valuationAmount: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { client: { select: { name: true } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      holdings: folios.map((f) => ({
        id: f.id,
        clientName: f.client.name,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeCode: f.schemeCode,
        schemeName: f.schemeName,
        assetClass: f.assetClass,
        balanceUnits: f.balanceUnits?.toString() ?? null,
        navPerUnit: f.navPerUnit?.toString() ?? null,
        valuationAmount: f.valuationAmount?.toString() ?? null,
        balanceAsOfDate: f.balanceAsOfDate,
      })),
    };
  }

  /** Client report: net worth = MF AUM (from Folio) + manually-entered Other Assets, per client. */
  async getNetWorthReport(page: number, requestedArnProfileIds?: string[], search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const clientWhere = {
      distributorId,
      ...(search ? { name: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}),
      ...(arnScope ? { folios: { some: { arnProfileId: { in: arnScope } } } } : {}),
    };

    const [total, clients] = await Promise.all([
      prisma.client.count({ where: clientWhere }),
      prisma.client.findMany({
        where: clientWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          folios: { where: arnScope ? { arnProfileId: { in: arnScope } } : undefined, select: { valuationAmount: true } },
          otherAssets: { select: { value: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      clients: clients.map((c) => {
        const mfAum = c.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0);
        const otherAssetsTotal = c.otherAssets.reduce((sum, a) => sum + Number(a.value), 0);
        return {
          id: c.id,
          name: c.name,
          mfAum: mfAum.toString(),
          otherAssetsTotal: otherAssetsTotal.toString(),
          netWorth: (mfAum + otherAssetsTotal).toString(),
        };
      }),
    };
  }

  /**
   * Client report: valuation report — per-client folio-wise holdings with a
   * subtotal, distinct from the flat Holdings table (which lists folios
   * without client grouping/subtotals).
   */
  async getValuationReport(page: number, requestedArnProfileIds?: string[], search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const folioFilter = arnScope ? { some: { arnProfileId: { in: arnScope } } } : { some: {} };
    const clientWhere = {
      distributorId,
      folios: folioFilter,
      ...(search ? { name: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}),
    };

    const [total, clients] = await Promise.all([
      prisma.client.count({ where: clientWhere }),
      prisma.client.findMany({
        where: clientWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          folios: {
            where: arnScope ? { arnProfileId: { in: arnScope } } : undefined,
            select: {
              folioNumber: true,
              amcCode: true,
              schemeCode: true,
              schemeName: true,
              balanceUnits: true,
              navPerUnit: true,
              valuationAmount: true,
              balanceAsOfDate: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        subtotal: c.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0).toString(),
        folios: c.folios.map((f) => ({
          folioNumber: f.folioNumber,
          amcCode: f.amcCode,
          schemeCode: f.schemeCode,
          schemeName: f.schemeName,
          balanceUnits: f.balanceUnits?.toString() ?? null,
          navPerUnit: f.navPerUnit?.toString() ?? null,
          valuationAmount: f.valuationAmount?.toString() ?? null,
          balanceAsOfDate: f.balanceAsOfDate,
        })),
      })),
    };
  }

  /**
   * Brokerage report — real CAMS BROKPERC/BROKCOMM data (previously parsed
   * but never persisted, see [[mfd_ingestion_engine]]). KFintech's own
   * brokerage columns exist in its report layout but were blank in the real
   * export ingested, so KFintech transactions won't show a brokerage amount
   * — that's a real data gap on the source side, not a bug here.
   *
   * All filters optional and combinable — date range (from/to on
   * transaction date), amcCode, clientId, arnProfileIds — so the summary
   * and the transaction list below can both be scoped identically for real
   * drill-down (pick an AMC row here, the transaction list narrows to it).
   */
  async getBrokerageSummary(filters: { from?: string; to?: string; amcCode?: string; clientId?: string; arnProfileIds?: string[] }) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(filters.arnProfileIds);
    const where = this.buildBrokerageWhere(distributorId, filters, arnScope);

    const totalAgg = await prisma.transaction.aggregate({
      where,
      _sum: { brokerageAmount: true },
      _count: true,
    });

    // Each fragment starts with a leading space — Prisma.sql fragments are
    // concatenated with no separator, so "...::date" immediately followed
    // by "AND..." collapses into one token ("dateAND") and breaks the SQL
    // parser. Confirmed the hard way: combining amcCode + a date range 500'd
    // with a real Postgres syntax error before this fix.
    const dateFilter = Prisma.sql`${filters.from ? Prisma.sql` AND t.transaction_date >= ${filters.from}::date` : Prisma.empty}${
      filters.to ? Prisma.sql` AND t.transaction_date <= ${filters.to}::date` : Prisma.empty
    }`;
    const amcFilter = filters.amcCode ? Prisma.sql` AND f.amc_code = ${filters.amcCode}` : Prisma.empty;
    const clientFilter = filters.clientId ? Prisma.sql` AND f.client_id = ${filters.clientId}::uuid` : Prisma.empty;
    const arnFilter = arnScope ? Prisma.sql` AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty;

    const byAmc = await prisma.$queryRaw<Array<{ amcCode: string; total: string; count: number }>>`
      SELECT f.amc_code AS "amcCode", COALESCE(SUM(t.brokerage_amount), 0) AS total, COUNT(t.id)::int AS count
      FROM transactions t
      JOIN folios f ON f.id = t.folio_id
      WHERE t.distributor_id = ${distributorId}::uuid AND t.brokerage_amount IS NOT NULL
        ${dateFilter}${amcFilter}${clientFilter}${arnFilter}
      GROUP BY f.amc_code
      ORDER BY total DESC
    `;

    const sampleNames = await prisma.folio.findMany({
      where: { distributorId, amcCode: { in: byAmc.map((r) => r.amcCode) }, schemeName: { not: null } },
      distinct: ["amcCode"],
      select: { amcCode: true, schemeName: true },
    });
    const nameByAmc = new Map(sampleNames.map((s) => [s.amcCode, s.schemeName]));

    return {
      totalBrokerage: totalAgg._sum.brokerageAmount?.toString() ?? "0",
      transactionsWithBrokerage: totalAgg._count,
      byAmc: byAmc.map((r) => ({
        amcCode: r.amcCode,
        amcName: resolveAmcName(nameByAmc.get(r.amcCode), r.amcCode),
        total: r.total,
        count: r.count,
      })),
    };
  }

  async getBrokerageTransactions(
    page: number,
    filters: { from?: string; to?: string; amcCode?: string; clientId?: string; arnProfileIds?: string[] },
  ) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(filters.arnProfileIds);
    const where = this.buildBrokerageWhere(distributorId, filters, arnScope);

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          folio: { select: { folioNumber: true, amcCode: true, schemeName: true, client: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      transactions: transactions.map((t) => ({
        id: t.id,
        clientId: t.folio.client.id,
        clientName: t.folio.client.name,
        folioNumber: t.folio.folioNumber,
        amcCode: t.folio.amcCode,
        schemeName: t.folio.schemeName,
        transactionDescription: t.transactionDescription ?? t.transactionType,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        brokeragePercent: t.brokeragePercent?.toString() ?? null,
        brokerageAmount: t.brokerageAmount?.toString() ?? null,
      })),
    };
  }

  private buildBrokerageWhere(
    distributorId: string,
    filters: { from?: string; to?: string; amcCode?: string; clientId?: string },
    arnScope?: string[],
  ) {
    return {
      distributorId,
      brokerageAmount: { not: null },
      ...(filters.from || filters.to
        ? {
            transactionDate: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
      folio: {
        ...(filters.amcCode ? { amcCode: filters.amcCode } : {}),
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      },
    };
  }

  /**
   * Client report: family-wise AUM allocation — only buildable since
   * Family Master (2026-07-23) exists. Clients with no family are grouped
   * under a single "Unassigned" bucket rather than dropped, so the
   * percentages still add to 100%.
   */
  async getFamilyAllocationReport(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const clients = await prisma.client.findMany({
      where: {
        distributorId,
        mergedIntoClientId: null,
        ...(arnScope ? { folios: { some: { arnProfileId: { in: arnScope } } } } : {}),
      },
      select: {
        id: true,
        name: true,
        familyId: true,
        family: { select: { familyName: true } },
        folios: { where: arnScope ? { arnProfileId: { in: arnScope } } : undefined, select: { valuationAmount: true } },
      },
    });

    const totalAum = clients.reduce((sum, c) => sum + c.folios.reduce((s, f) => s + Number(f.valuationAmount ?? 0), 0), 0);
    const byFamily = new Map<string, { familyName: string; aum: number; memberCount: number }>();
    for (const c of clients) {
      const key = c.familyId ?? "unassigned";
      const familyName = c.family?.familyName ?? "Unassigned (no family)";
      const clientAum = c.folios.reduce((s, f) => s + Number(f.valuationAmount ?? 0), 0);
      const bucket = byFamily.get(key) ?? { familyName, aum: 0, memberCount: 0 };
      bucket.aum += clientAum;
      bucket.memberCount += 1;
      byFamily.set(key, bucket);
    }

    return Array.from(byFamily.entries())
      .map(([familyId, b]) => ({
        familyId: familyId === "unassigned" ? null : familyId,
        familyName: b.familyName,
        memberCount: b.memberCount,
        aum: b.aum.toString(),
        percentOfTotal: totalAum > 0 ? ((b.aum / totalAum) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => Number(b.aum) - Number(a.aum));
  }

  /**
   * Client report: holdings/transactions that came from a CAS import (see
   * import-external module) rather than your regular RTA mail — distinct
   * from everything else, which is all source: "RTA_MAILBACK". Note: a
   * CAS-sourced folio never carries an arnProfileId (it may belong to an
   * AMC this MFD doesn't hold an ARN for at all) — filtering this report to
   * one specific ARN will therefore always come back empty, which is
   * correct, not a bug: external data is by definition not attributed to
   * any of your ARNs.
   */
  async getCasReport(page: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = { distributorId, source: "CAS_IMPORT", ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) };

    const [total, folios] = await Promise.all([
      prisma.folio.count({ where }),
      prisma.folio.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { client: { select: { id: true, name: true } }, _count: { select: { transactions: true } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      folios: folios.map((f) => ({
        id: f.id,
        clientId: f.client.id,
        clientName: f.client.name,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeName: f.schemeName,
        valuationAmount: f.valuationAmount?.toString() ?? null,
        transactionCount: f._count.transactions,
      })),
    };
  }

  /**
   * Client report: capital gains — deliberately labeled "best-effort
   * estimate" in the frontend, not a tax-filing document. Uses real FIFO
   * lot matching (computeFifoRealizedGains/computeFifoUnrealizedGain in
   * capital-gains.ts) — the method actually required for Indian MF capital
   * gains — with current-law STCG/LTCG thresholds/rates, equity Section
   * 112A grandfathering (when a real 2018-01-31 NAV has been backfilled),
   * and live-AMFI-NAV current valuation where a folio's ISIN is known.
   * Known gaps stated in the frontend's own caveat box: the ₹1.25L/year
   * equity LTCG exemption isn't netted (an annual, cross-folio concept),
   * and debt-fund STCG tax depends on the investor's own income slab
   * (shown as gain only, no estimated tax).
   *
   * realized=true: gain on REDEMPTION/SWITCH_OUT transactions that have
   * already happened. realized=false (notional): unrealized gain on
   * CURRENT holdings — current valuation minus each remaining lot's cost.
   *
   * `fyStartDate`/`fyEndDate` (April 1 – March 31, computed by the caller)
   * only filter REALIZED gains, by sale date — a notional/unrealized
   * position has no sale date to filter by, it's inherently "as of today"
   * regardless of which FY is picked, so the param is simply ignored for
   * realized=false. The FIFO walk itself always uses the folio's FULL
   * transaction history regardless of this filter (a sale in the selected
   * FY still needs every earlier purchase to compute its real cost basis)
   * — only the already-computed lots are filtered by saleDate afterward.
   */
  async getCapitalGainsReport(
    realized: boolean,
    requestedArnProfileIds?: string[],
    clientId?: string,
    fyStartDate?: Date,
    fyEndDate?: Date,
    // Client-portal callers run under ClientTenantContext, not TenantContext
    // (a distinct, separate AsyncLocalStorage scope — see
    // ClientAuthMiddleware's doc comment), so TenantContext.currentDistributorId()
    // would throw for them. ClientPortalService passes its own
    // ClientTenantContext-sourced distributorId here instead of duplicating
    // this whole FIFO/tax computation a second time.
    overrideDistributorId?: string,
  ) {
    const distributorId = overrideDistributorId ?? TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const folios = await prisma.folio.findMany({
      where: { distributorId, ...(clientId ? { clientId } : {}), ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
      select: {
        id: true,
        folioNumber: true,
        schemeName: true,
        amcCode: true,
        assetClass: true,
        isin: true,
        balanceUnits: true,
        valuationAmount: true,
        client: { select: { id: true, name: true } },
        transactions: {
          orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
          select: { transactionType: true, transactionDate: true, amount: true, units: true, isRejection: true },
        },
      },
    });

    const navByIsin = realized ? new Map<string, { latestNav: number; latestNavDate: Date | null }>() : await fetchLatestNavByIsin(folios.map((f) => f.isin));
    const grandfatherNavByIsin = await fetchGrandfatherNavByIsin(folios.map((f) => f.isin));

    const rows: Array<{
      folioId: string;
      clientId: string;
      clientName: string;
      folioNumber: string;
      schemeName: string | null;
      taxCategory: AssetTaxCategory;
      stcgGain: string;
      ltcgGain: string;
      estimatedTax: string | null;
      taxNotComputableGain: string;
      grandfatheringNote: boolean;
      grandfatheringApplied: boolean;
      valuationSource: "RTA" | "LIVE_NAV";
      asOfOrDate: Date | null;
      /** True if any lot in this folio had no matching purchase in the ingested transaction history — its cost basis and STCG/LTCG classification are a placeholder (100% gain, STCG), not necessarily correct. Typically means since-inception import hasn't captured this folio's full history yet. */
      hasIncompleteHistory: boolean;
      /** Portion of the gain above that's coming from those flagged lots specifically — the amount that's likely to change once full history is imported. */
      incompleteHistoryGain: string;
    }> = [];

    for (const folio of folios) {
      if (realized) {
        const allLots = computeFifoRealizedGains(folio.transactions, folio.assetClass, grandfatherNavByIsin.get(folio.isin ?? "") ?? null);
        const lots =
          fyStartDate && fyEndDate ? allLots.filter((l) => l.saleDate >= fyStartDate && l.saleDate <= fyEndDate) : allLots;
        if (lots.length === 0) continue;

        let stcgGain = 0;
        let ltcgGain = 0;
        let estimatedTax = 0;
        let hasComputableTax = false;
        let taxNotComputableGain = 0;
        let grandfatheringNote = false;
        let grandfatheringApplied = false;
        let lastSaleDate: Date | null = null;
        let hasIncompleteHistory = false;
        let incompleteHistoryGain = 0;

        for (const lot of lots) {
          if (lot.classification === "STCG") stcgGain += lot.gain;
          else ltcgGain += lot.gain;
          if (lot.estimatedTax !== null) {
            estimatedTax += lot.estimatedTax;
            hasComputableTax = true;
          } else {
            taxNotComputableGain += lot.gain;
          }
          if (lot.grandfatheringApplicable) grandfatheringNote = true;
          if (lot.grandfatheringApplied) grandfatheringApplied = true;
          if (!lastSaleDate || lot.saleDate > lastSaleDate) lastSaleDate = lot.saleDate;
          if (lot.costBasisUnknown) {
            hasIncompleteHistory = true;
            incompleteHistoryGain += lot.gain;
          }
        }

        rows.push({
          folioId: folio.id,
          clientId: folio.client.id,
          clientName: folio.client.name,
          folioNumber: folio.folioNumber,
          schemeName: folio.schemeName,
          taxCategory: classifyAssetTaxCategory(folio.assetClass),
          stcgGain: stcgGain.toFixed(2),
          ltcgGain: ltcgGain.toFixed(2),
          estimatedTax: hasComputableTax ? estimatedTax.toFixed(2) : null,
          taxNotComputableGain: taxNotComputableGain.toFixed(2),
          grandfatheringNote,
          grandfatheringApplied,
          valuationSource: "RTA",
          asOfOrDate: lastSaleDate,
          hasIncompleteHistory,
          incompleteHistoryGain: incompleteHistoryGain.toFixed(2),
        });
      } else {
        const currentUnits = Number(folio.balanceUnits ?? 0);
        const nav = navByIsin.get(folio.isin ?? "");
        const liveValuation = computeLiveValue(folio.balanceUnits, nav);
        const currentValue = liveValuation.liveValue !== null ? Number(liveValuation.liveValue) : Number(folio.valuationAmount ?? 0);
        if (currentUnits <= 0 && currentValue <= 0) continue;

        const lots = computeFifoUnrealizedGain(folio.transactions, folio.assetClass, currentUnits, currentValue, undefined, grandfatherNavByIsin.get(folio.isin ?? "") ?? null);
        if (lots.length === 0) continue;

        let stcgGain = 0;
        let ltcgGain = 0;
        let estimatedTax = 0;
        let hasComputableTax = false;
        let taxNotComputableGain = 0;
        let grandfatheringNote = false;
        let grandfatheringApplied = false;
        let hasIncompleteHistory = false;
        let incompleteHistoryGain = 0;

        for (const lot of lots) {
          if (lot.classification === "STCG") stcgGain += lot.gain;
          else ltcgGain += lot.gain;
          if (lot.estimatedTax !== null) {
            estimatedTax += lot.estimatedTax;
            hasComputableTax = true;
          } else {
            taxNotComputableGain += lot.gain;
          }
          if (lot.grandfatheringApplicable) grandfatheringNote = true;
          if (lot.grandfatheringApplied) grandfatheringApplied = true;
          if (lot.costBasisUnknown) {
            hasIncompleteHistory = true;
            incompleteHistoryGain += lot.gain;
          }
        }

        rows.push({
          folioId: folio.id,
          clientId: folio.client.id,
          clientName: folio.client.name,
          folioNumber: folio.folioNumber,
          schemeName: folio.schemeName,
          taxCategory: classifyAssetTaxCategory(folio.assetClass),
          stcgGain: stcgGain.toFixed(2),
          ltcgGain: ltcgGain.toFixed(2),
          estimatedTax: hasComputableTax ? estimatedTax.toFixed(2) : null,
          taxNotComputableGain: taxNotComputableGain.toFixed(2),
          grandfatheringNote,
          grandfatheringApplied,
          valuationSource: liveValuation.liveValue !== null ? "LIVE_NAV" : "RTA",
          asOfOrDate: null,
          hasIncompleteHistory,
          incompleteHistoryGain: incompleteHistoryGain.toFixed(2),
        });
      }
    }

    return rows;
  }

  /**
   * Real min/max transaction date for one client — used to bound which
   * financial years actually make sense to offer for that client's capital
   * gains report (no point listing FY2018-19 if their earliest transaction
   * is 2022), rather than a fixed hardcoded FY list.
   */
  async getClientTransactionDateRange(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId }, select: { id: true } });
    if (!client) return { minDate: null, maxDate: null };
    const result = await prisma.transaction.aggregate({
      where: { distributorId, folio: { clientId } },
      _min: { transactionDate: true },
      _max: { transactionDate: true },
    });
    return {
      minDate: result._min.transactionDate?.toISOString() ?? null,
      maxDate: result._max.transactionDate?.toISOString() ?? null,
    };
  }

  /**
   * Transaction/lot-wise capital gains detail — one row per FIFO lot (each
   * purchase-lot's contribution to a sale, or, for notional, each
   * still-held lot), not one row per folio. The folio-aggregated
   * `getCapitalGainsReport` is a quick overview; this is the real
   * line-by-line breakdown (acquisition date, sale date, holding period,
   * cost, proceeds, gain per lot) an actual ITR Schedule 112A/CG filing
   * needs — a single STCG/LTCG total per folio hides exactly the detail a
   * return requires. Same clientId/FY-range scoping and FIFO engine as
   * getCapitalGainsReport (see that method's doc comment for the
   * FY-filters-realized-only rationale); this only differs in NOT
   * aggregating the lots before returning them.
   */
  async getCapitalGainsDetailReport(
    realized: boolean,
    requestedArnProfileIds?: string[],
    clientId?: string,
    fyStartDate?: Date,
    fyEndDate?: Date,
    /** See getCapitalGainsReport's own doc comment on why this exists — same client-portal reuse. */
    overrideDistributorId?: string,
  ) {
    const distributorId = overrideDistributorId ?? TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const folios = await prisma.folio.findMany({
      where: { distributorId, ...(clientId ? { clientId } : {}), ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
      select: {
        id: true,
        folioNumber: true,
        schemeName: true,
        assetClass: true,
        isin: true,
        balanceUnits: true,
        valuationAmount: true,
        client: { select: { id: true, name: true } },
        transactions: {
          orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
          select: { transactionType: true, transactionDate: true, amount: true, units: true, isRejection: true },
        },
      },
    });

    const navByIsin = realized ? new Map<string, { latestNav: number; latestNavDate: Date | null }>() : await fetchLatestNavByIsin(folios.map((f) => f.isin));
    const grandfatherNavByIsin = await fetchGrandfatherNavByIsin(folios.map((f) => f.isin));

    const rows: Array<{
      folioId: string;
      clientId: string;
      clientName: string;
      folioNumber: string;
      schemeName: string | null;
      taxCategory: AssetTaxCategory;
      purchaseDate: Date;
      saleDate: Date | null;
      units: string;
      costBasis: string;
      saleProceeds: string;
      gain: string;
      holdingDays: number;
      classification: GainClassification;
      estimatedTax: string | null;
      grandfatheringApplicable: boolean;
      grandfatheringApplied: boolean;
      /** See RealizedGainLot/UnrealizedGainLot's own doc comment — true means no matching purchase was found in the ingested history, so costBasis/classification here is a placeholder, not necessarily correct. */
      costBasisUnknown: boolean;
    }> = [];

    for (const folio of folios) {
      if (realized) {
        const allLots = computeFifoRealizedGains(folio.transactions, folio.assetClass, grandfatherNavByIsin.get(folio.isin ?? "") ?? null);
        const lots =
          fyStartDate && fyEndDate ? allLots.filter((l) => l.saleDate >= fyStartDate && l.saleDate <= fyEndDate) : allLots;
        for (const lot of lots) {
          rows.push({
            folioId: folio.id,
            clientId: folio.client.id,
            clientName: folio.client.name,
            folioNumber: folio.folioNumber,
            schemeName: folio.schemeName,
            taxCategory: lot.taxCategory,
            purchaseDate: lot.purchaseDate,
            saleDate: lot.saleDate,
            units: lot.units.toFixed(4),
            costBasis: lot.costBasis.toFixed(2),
            saleProceeds: lot.saleProceeds.toFixed(2),
            gain: lot.gain.toFixed(2),
            holdingDays: lot.holdingDays,
            classification: lot.classification,
            estimatedTax: lot.estimatedTax !== null ? lot.estimatedTax.toFixed(2) : null,
            grandfatheringApplicable: lot.grandfatheringApplicable,
            grandfatheringApplied: lot.grandfatheringApplied,
            costBasisUnknown: lot.costBasisUnknown,
          });
        }
      } else {
        const currentUnits = Number(folio.balanceUnits ?? 0);
        const nav = navByIsin.get(folio.isin ?? "");
        const liveValuation = computeLiveValue(folio.balanceUnits, nav);
        const currentValue = liveValuation.liveValue !== null ? Number(liveValuation.liveValue) : Number(folio.valuationAmount ?? 0);
        if (currentUnits <= 0 && currentValue <= 0) continue;

        const lots = computeFifoUnrealizedGain(folio.transactions, folio.assetClass, currentUnits, currentValue, undefined, grandfatherNavByIsin.get(folio.isin ?? "") ?? null);
        for (const lot of lots) {
          rows.push({
            folioId: folio.id,
            clientId: folio.client.id,
            clientName: folio.client.name,
            folioNumber: folio.folioNumber,
            schemeName: folio.schemeName,
            taxCategory: lot.taxCategory,
            purchaseDate: lot.purchaseDate,
            saleDate: null,
            units: lot.units.toFixed(4),
            costBasis: lot.costBasis.toFixed(2),
            saleProceeds: lot.currentValue.toFixed(2),
            gain: lot.gain.toFixed(2),
            holdingDays: lot.holdingDays,
            classification: lot.classification,
            estimatedTax: lot.estimatedTax !== null ? lot.estimatedTax.toFixed(2) : null,
            grandfatheringApplicable: lot.grandfatheringApplicable,
            grandfatheringApplied: lot.grandfatheringApplied,
            costBasisUnknown: lot.costBasisUnknown,
          });
        }
      }
    }

    return rows.sort((a, b) => (a.saleDate ?? a.purchaseDate).getTime() - (b.saleDate ?? b.purchaseDate).getTime());
  }

  /** Distributor report: new clients and new AUM added per month, last 12 months — a real "how's the business growing" view. */
  async getBusinessDevelopmentReport(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const arnJoinFilter = arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty;

    // "New clients" scoped to an ARN means clients who have at least one
    // folio under that ARN — a plain client-table query can't express that,
    // so this joins folios and counts DISTINCT clients rather than rows.
    const newClientsByMonth = arnScope
      ? await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
          SELECT to_char(date_trunc('month', c.created_at), 'YYYY-MM') AS month, COUNT(DISTINCT c.id)::bigint AS count
          FROM clients c
          JOIN folios f ON f.client_id = c.id
          WHERE c.distributor_id = ${distributorId}::uuid AND c.created_at >= (CURRENT_DATE - INTERVAL '12 months')
            ${arnJoinFilter}
          GROUP BY 1 ORDER BY 1 ASC
        `
      : await prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
          SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::bigint AS count
          FROM clients
          WHERE distributor_id = ${distributorId}::uuid AND created_at >= (CURRENT_DATE - INTERVAL '12 months')
          GROUP BY 1 ORDER BY 1 ASC
        `;

    const newAumByMonth = await prisma.$queryRaw<Array<{ month: string; total: string }>>`
      SELECT to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') AS month,
             COALESCE(SUM(t.amount), 0)::text AS total
      FROM transactions t
      JOIN folios f ON f.id = t.folio_id
      WHERE t.distributor_id = ${distributorId}::uuid
        AND t.transaction_type IN ('PURCHASE', 'SWITCH_IN')
        AND t.transaction_date >= (CURRENT_DATE - INTERVAL '12 months')
        ${arnJoinFilter}
      GROUP BY 1 ORDER BY 1 ASC
    `;

    const aumByMonthMap = new Map(newAumByMonth.map((r) => [r.month, r.total]));
    return newClientsByMonth.map((r) => ({
      month: r.month,
      newClients: Number(r.count),
      newInflowAmount: aumByMonthMap.get(r.month) ?? "0",
    }));
  }

  /** Distributor report: dividend payouts/reinvestments — real transaction data, no separate ingestion needed. */
  async getDividendReport(page: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = {
      distributorId,
      transactionType: { in: ["DIVIDEND_PAYOUT", "DIVIDEND_REINVEST"] },
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { folio: { select: { folioNumber: true, schemeName: true, client: { select: { name: true } } } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      transactions: transactions.map((t) => ({
        id: t.id,
        clientName: t.folio.client.name,
        folioNumber: t.folio.folioNumber,
        schemeName: t.folio.schemeName,
        transactionType: t.transactionType,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
      })),
    };
  }

  /**
   * Distributor report: SIPs due soon — estimated from startDate +
   * frequency, since no per-installment "next due date" field is ingested
   * (WBR49/MFSD243 carry registration/status, not a payment schedule).
   * Labeled as an estimate in the frontend, not authoritative. Scoped to
   * registrationType: "SIP" — see getRegistrationReport's doc comment for
   * why this filter is required (an active STP/SWP would otherwise show up
   * here mislabeled as a SIP installment due soon).
   */
  async getSipDueReport(withinDays = 7, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const activeSips = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        registrationType: "SIP",
        isActive: true,
        startDate: { not: null },
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      include: { folio: { select: { folioNumber: true, client: { select: { name: true } } } } },
    });

    const today = new Date();
    const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const rows: Array<{ id: string; clientName: string; folioNumber: string; sipAmount: string | null; estimatedNextDueDate: string }> = [];
    for (const sip of activeSips) {
      if (!sip.startDate) continue;
      // A One Shot registration (see sip-frequency.ts) has no "next"
      // installment at all — correctly excluded from a due-soon report.
      const next = estimateNextDueDate(sip.startDate, sip.frequency, today);
      if (next && next <= cutoff) {
        rows.push({
          id: sip.id,
          clientName: sip.folio.client.name,
          folioNumber: sip.folio.folioNumber,
          sipAmount: sip.sipAmount?.toString() ?? null,
          estimatedNextDueDate: next.toISOString().slice(0, 10),
        });
      }
    }
    return rows.sort((a, b) => a.estimatedNextDueDate.localeCompare(b.estimatedNextDueDate));
  }

  /**
   * Frequency-wise breakdown of active SIP registrations — the dashboard's
   * "Active SIP Value" was a single blended sum of every active
   * SipRegistration.sipAmount regardless of frequency, which silently added
   * a quarterly SIP's full installment into what's labeled a monthly
   * figure. This breaks it out per real frequency (count + raw sum) and
   * also computes a genuinely comparable "monthly equivalent" per bucket
   * and overall (quarterly ÷3, weekly ×4.33, etc — see sip-frequency.ts),
   * so "Active SIP Value" can mean "what I'd expect this month" rather
   * than an apples-to-oranges sum. Scoped to registrationType: "SIP" (see
   * getRegistrationReport's doc comment) — was blended across SIP+STP+SWP
   * before that field existed; now that it does, this is genuinely SIP-only,
   * and getRegistrationTypeBreakdown below covers the SIP-vs-STP-vs-SWP split.
   */
  async getSipBreakdown(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const activeSips = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        registrationType: "SIP",
        isActive: true,
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      select: { sipAmount: true, frequency: true },
    });

    const buckets = new Map<string, { frequency: string; count: number; totalAmount: number; monthlyEquivalent: number }>();
    let totalCount = 0;
    let totalRawAmount = 0;
    let totalMonthlyEquivalent = 0;
    for (const sip of activeSips) {
      const amount = Number(sip.sipAmount ?? 0);
      const key = normalizeFrequencyKey(sip.frequency);
      const monthly = monthlyEquivalentAmount(amount, sip.frequency);
      const bucket = buckets.get(key) ?? { frequency: key, count: 0, totalAmount: 0, monthlyEquivalent: 0 };
      bucket.count++;
      bucket.totalAmount += amount;
      bucket.monthlyEquivalent += monthly;
      buckets.set(key, bucket);

      totalCount++;
      totalRawAmount += amount;
      totalMonthlyEquivalent += monthly;
    }

    return {
      totalCount,
      totalRawAmount: totalRawAmount.toString(),
      totalMonthlyEquivalent: totalMonthlyEquivalent.toFixed(2),
      byFrequency: Array.from(buckets.values())
        .map((b) => ({
          frequency: b.frequency,
          count: b.count,
          totalAmount: b.totalAmount.toString(),
          monthlyEquivalent: b.monthlyEquivalent.toFixed(2),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * SIP-vs-STP-vs-SWP split of active registrations — for the Dashboard/
   * Analysis breakdown card. Count + raw sipAmount sum + monthly-equivalent
   * sum per type (see monthlyEquivalentAmount — puts a quarterly STP and a
   * monthly SIP on the same comparable footing), covering all three
   * registrationType values in one query rather than three separate calls.
   */
  async getRegistrationTypeBreakdown(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const activeRegistrations = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        isActive: true,
        registrationType: { not: null },
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      select: { registrationType: true, sipAmount: true, frequency: true },
    });

    const buckets = new Map<string, { count: number; totalAmount: number; monthlyEquivalent: number }>();
    for (const type of ["SIP", "STP", "SWP"]) {
      buckets.set(type, { count: 0, totalAmount: 0, monthlyEquivalent: 0 });
    }
    for (const r of activeRegistrations) {
      const type = r.registrationType as string;
      const bucket = buckets.get(type);
      if (!bucket) continue; // defensive — registrationType is a closed set, but never trust it blindly
      const amount = Number(r.sipAmount ?? 0);
      bucket.count++;
      bucket.totalAmount += amount;
      bucket.monthlyEquivalent += monthlyEquivalentAmount(amount, r.frequency);
    }

    return Array.from(buckets.entries()).map(([registrationType, b]) => ({
      registrationType,
      count: b.count,
      totalAmount: b.totalAmount.toString(),
      monthlyEquivalent: b.monthlyEquivalent.toFixed(2),
    }));
  }

  /**
   * Flat, real per-registration SIP/STP data (real registration/start/end
   * dates, amount, frequency, estimated next-due) — the frontend builds
   * both the AMC->Scheme->Client hierarchy and the reverse Client->Scheme
   * view from this same flat list via grouping, rather than the backend
   * shipping two redundant nested structures for a dataset this small.
   * Same underlying SipRegistration rows the dashboard's Active SIP Value/
   * Count and the SIP Addition/Expiring reports already use — this is a
   * different view of the same real data, not a separate source. Scoped to
   * registrationType: "SIP" (see getRegistrationReport's doc comment).
   */
  async getSipExplorer(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const registrations = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        registrationType: "SIP",
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      orderBy: [{ isActive: "desc" }, { registrationDate: "desc" }],
      include: {
        folio: {
          select: {
            folioNumber: true,
            amcCode: true,
            schemeCode: true,
            schemeName: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    const today = new Date();
    return registrations.map((r) => ({
      id: r.id,
      clientId: r.folio.client.id,
      clientName: r.folio.client.name,
      amcCode: r.folio.amcCode,
      amcName: resolveAmcName(r.folio.schemeName, r.folio.amcCode),
      schemeName: r.folio.schemeName ?? r.schemeCode,
      folioNumber: r.folio.folioNumber,
      sipAmount: r.sipAmount?.toString() ?? null,
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate,
      registrationDate: r.registrationDate,
      ceaseDate: r.ceaseDate,
      isActive: r.isActive,
      estimatedNextDueDate: r.isActive && r.startDate ? estimateNextDueDate(r.startDate, r.frequency, today)?.toISOString().slice(0, 10) ?? null : null,
    }));
  }

  /**
   * Distributor report: active SIPs whose endDate falls within the window
   * — real data, direct from SipRegistration.endDate. Scoped to
   * registrationType: "SIP" (see getRegistrationReport's doc comment).
   */
  async getSipExpiringReport(withinDays = 30, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const sips = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        registrationType: "SIP",
        isActive: true,
        endDate: { not: null, lte: cutoff },
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      orderBy: { endDate: "asc" },
      include: { folio: { select: { folioNumber: true, client: { select: { name: true } } } } },
    });
    return sips.map((s) => ({
      id: s.id,
      clientName: s.folio.client.name,
      folioNumber: s.folio.folioNumber,
      sipAmount: s.sipAmount?.toString() ?? null,
      endDate: s.endDate,
    }));
  }

  /**
   * From CAMS WBR95 ("Brokerage Withheld") — real per-folio brokerage CAMS
   * is withholding because that folio's KYC is invalid. The three
   * withheld-amount fields' exact business meaning (trail fee/transaction
   * incentive/upfront) is unconfirmed — no field-layout glossary exists for
   * this report anywhere supplied so far, see BrokerageWithheld's schema
   * doc comment — shown as reported, not re-labeled with false confidence.
   */
  async getBrokerageWithheldReport(page: number, requestedArnProfileIds?: string[], search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = {
      distributorId,
      ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      ...(search ? { investorName: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}),
    };
    const [total, rows, totals] = await Promise.all([
      prisma.brokerageWithheld.count({ where }),
      prisma.brokerageWithheld.findMany({
        where,
        orderBy: { reportDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { folio: { select: { clientId: true } } },
      }),
      prisma.brokerageWithheld.aggregate({
        where,
        _sum: { trailFeeWithheld: true, transactionIncentiveWithheld: true, upfrontWithheld: true },
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      totalTrailFeeWithheld: totals._sum.trailFeeWithheld?.toString() ?? "0",
      totalTransactionIncentiveWithheld: totals._sum.transactionIncentiveWithheld?.toString() ?? "0",
      totalUpfrontWithheld: totals._sum.upfrontWithheld?.toString() ?? "0",
      rows: rows.map((r) => ({
        id: r.id,
        clientId: r.folio?.clientId ?? null,
        folioNumber: r.folioNumber,
        investorName: r.investorName,
        investorPan: r.investorPan,
        amcCode: r.amcCode,
        schemeCode: r.schemeCode,
        kycStatusAtWithholding: r.kycStatusAtWithholding,
        trailFeeWithheld: r.trailFeeWithheld?.toString() ?? null,
        transactionIncentiveWithheld: r.transactionIncentiveWithheld?.toString() ?? null,
        upfrontWithheld: r.upfrontWithheld?.toString() ?? null,
        processedDate: r.processedDate,
        reportDate: r.reportDate,
      })),
    };
  }

  /**
   * From CAMS WBR5 ("A list of SIP Investors whose plans expire shortly")
   * — the RTA's own authoritative expiring-systematic-registration list, a
   * genuine upgrade over getSipExpiringReport above (which only estimates
   * from SipRegistration.endDate). Real sample data confirmed this also
   * covers expiring STP/switch registrations (transactionType "SO" with a
   * toSchemeName), not pure SIP alone.
   */
  async getSipStpExpiringCamsReport(page: number, requestedArnProfileIds?: string[], search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = {
      distributorId,
      ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      ...(search ? { investorName: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.rtaSystematicExpiry.count({ where }),
      prisma.rtaSystematicExpiry.findMany({
        where,
        orderBy: { expiryDate: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { folio: { select: { clientId: true } } },
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      rows: rows.map((r) => ({
        id: r.id,
        clientId: r.folio?.clientId ?? null,
        folioNumber: r.folioNumber,
        refNumber: r.refNumber,
        investorName: r.investorName,
        schemeName: r.schemeName,
        toSchemeName: r.toSchemeName,
        transactionType: r.transactionType,
        amount: r.amount?.toString() ?? null,
        units: r.units?.toString() ?? null,
        expiryDate: r.expiryDate,
        taxStatus: r.taxStatus,
      })),
    };
  }

  /** Distributor report: transaction counts/amounts grouped by type — a rollup view of the transaction register. */
  async getTransactionSummaryReport(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const rows = await prisma.transaction.groupBy({
      by: ["transactionType"],
      where: { distributorId, ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}) },
      _count: true,
      _sum: { amount: true },
    });
    return rows
      .map((r) => ({ transactionType: r.transactionType, count: r._count, totalAmount: r._sum.amount?.toString() ?? "0" }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Latest two dated NAVs per ISIN from the real AMFI time series
   * (scheme_nav_history — populated once daily by nav-sync.processor.ts as
   * of the day this was added, so day-over-day change starts becoming
   * available from the second day onward, not retroactively for history
   * that predates this). Returns null entries (not a fabricated 0%) for any
   * ISIN with fewer than 2 recorded days so far.
   */
  private async getLatestNavChangeByIsin(isins: string[]): Promise<Map<string, { latestNav: number; latestDate: Date; prevNav: number; prevDate: Date }>> {
    const map = new Map<string, { latestNav: number; latestDate: Date; prevNav: number; prevDate: Date }>();
    const uniqueIsins = Array.from(new Set(isins.filter(Boolean)));
    if (uniqueIsins.length === 0) return map;

    const rows = await prisma.$queryRaw<Array<{ isin: string; nav_date: Date; nav: Prisma.Decimal; rn: bigint }>>`
      SELECT isin, nav_date, nav, rn FROM (
        SELECT isin, nav_date, nav, ROW_NUMBER() OVER (PARTITION BY isin ORDER BY nav_date DESC) AS rn
        FROM scheme_nav_history
        WHERE isin = ANY(${uniqueIsins})
      ) ranked
      WHERE rn <= 2
    `;
    const byIsin = new Map<string, Array<{ nav_date: Date; nav: Prisma.Decimal; rn: bigint }>>();
    for (const r of rows) {
      const arr = byIsin.get(r.isin) ?? [];
      arr.push(r);
      byIsin.set(r.isin, arr);
    }
    for (const [isin, arr] of byIsin) {
      const latest = arr.find((r) => r.rn === 1n);
      const prev = arr.find((r) => r.rn === 2n);
      if (latest && prev) {
        map.set(isin, { latestNav: Number(latest.nav), latestDate: latest.nav_date, prevNav: Number(prev.nav), prevDate: prev.nav_date });
      }
    }
    return map;
  }

  /**
   * Distributor report: per-client XIRR — a standard Newton-Raphson XIRR
   * over every PURCHASE/SWITCH_IN (negative cash flow) and
   * REDEMPTION/SWITCH_OUT (positive cash flow) transaction, plus current
   * valuation as a final positive cash flow "as if sold today". Skips
   * clients with fewer than 2 cash flows (XIRR needs at least one outflow
   * and one inflow) or where Newton-Raphson doesn't converge, rather than
   * returning a misleading number. Also breaks each client down scheme-wise
   * (own XIRR/invested/current per folio) and, where at least two days of
   * real AMFI NAV history have accumulated for that folio's ISIN, a
   * day-over-day change — both for the "expand to scheme-wise" structural
   * view.
   */
  async getClientReturnsReport(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const clients = await prisma.client.findMany({
      where: {
        distributorId,
        mergedIntoClientId: null,
        ...(arnScope ? { folios: { some: { arnProfileId: { in: arnScope } } } } : {}),
      },
      select: {
        id: true,
        name: true,
        folios: {
          where: arnScope ? { arnProfileId: { in: arnScope } } : undefined,
          select: {
            id: true,
            folioNumber: true,
            schemeName: true,
            amcCode: true,
            schemeCode: true,
            isin: true,
            balanceUnits: true,
            valuationAmount: true,
            transactions: { select: { transactionType: true, transactionDate: true, amount: true } },
          },
        },
      },
    });

    const allIsins = clients.flatMap((c) => c.folios.map((f) => f.isin).filter((x): x is string => !!x));
    const navChangeByIsin = await this.getLatestNavChangeByIsin(allIsins);

    function xirrFor(cashFlows: Array<{ date: Date; amount: number }>): string | null {
      const xirr = cashFlows.length >= 2 ? computeXirr(cashFlows) : null;
      return xirr !== null ? (xirr * 100).toFixed(2) : null;
    }

    const results: Array<{
      clientId: string;
      clientName: string;
      xirr: string | null;
      currentValue: string;
      totalInvested: string;
      dayChangeAmount: string | null;
      folios: Array<{
        folioId: string;
        folioNumber: string;
        schemeName: string | null;
        amcCode: string;
        schemeCode: string;
        xirr: string | null;
        currentValue: string;
        invested: string;
        dayChangeAmount: string | null;
        dayChangePercent: string | null;
      }>;
    }> = [];

    for (const c of clients) {
      const clientCashFlows: Array<{ date: Date; amount: number }> = [];
      let totalInvested = 0;
      let dayChangeTotal = 0;
      let anyDayChange = false;
      const folioResults: (typeof results)[number]["folios"] = [];

      for (const f of c.folios) {
        const folioCashFlows: Array<{ date: Date; amount: number }> = [];
        let folioInvested = 0;
        for (const t of f.transactions) {
          const amount = Number(t.amount ?? 0);
          if (amount === 0) continue;
          if (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN") {
            folioCashFlows.push({ date: t.transactionDate, amount: -amount });
            folioInvested += amount;
          } else if (t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT") {
            folioCashFlows.push({ date: t.transactionDate, amount });
          }
        }
        const folioValue = Number(f.valuationAmount ?? 0);
        const folioForXirr = [...folioCashFlows];
        if (folioValue > 0) folioForXirr.push({ date: new Date(), amount: folioValue });

        let dayChangeAmount: string | null = null;
        let dayChangePercent: string | null = null;
        const navChange = f.isin ? navChangeByIsin.get(f.isin) : undefined;
        if (navChange && f.balanceUnits) {
          const units = Number(f.balanceUnits);
          const amount = units * (navChange.latestNav - navChange.prevNav);
          dayChangeAmount = amount.toFixed(2);
          dayChangePercent = navChange.prevNav !== 0 ? ((navChange.latestNav - navChange.prevNav) / navChange.prevNav * 100).toFixed(2) : null;
          dayChangeTotal += amount;
          anyDayChange = true;
        }

        folioResults.push({
          folioId: f.id,
          folioNumber: f.folioNumber,
          schemeName: f.schemeName,
          amcCode: f.amcCode,
          schemeCode: f.schemeCode,
          xirr: xirrFor(folioForXirr),
          currentValue: folioValue.toString(),
          invested: folioInvested.toString(),
          dayChangeAmount,
          dayChangePercent,
        });

        clientCashFlows.push(...folioCashFlows);
        totalInvested += folioInvested;
      }

      const currentValue = c.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0);
      if (currentValue > 0) {
        clientCashFlows.push({ date: new Date(), amount: currentValue });
      }

      results.push({
        clientId: c.id,
        clientName: c.name,
        xirr: xirrFor(clientCashFlows),
        currentValue: currentValue.toString(),
        totalInvested: totalInvested.toString(),
        dayChangeAmount: anyDayChange ? dayChangeTotal.toFixed(2) : null,
        folios: folioResults.sort((a, b) => Number(b.currentValue) - Number(a.currentValue)),
      });
    }

    return results.sort((a, b) => Number(b.currentValue) - Number(a.currentValue));
  }
}
