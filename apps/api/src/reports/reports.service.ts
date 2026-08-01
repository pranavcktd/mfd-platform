import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { resolveAmcName } from "@mfd/shared";
import { TenantContext } from "../tenant/tenant-context";

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

  /** Distributor report: SIP registrations, filterable by lifecycle status. */
  async getSipReport(status: "new" | "active" | "ceased" | undefined, page: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const where = {
      distributorId,
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
        include: { folio: { select: { folioNumber: true, amcCode: true, client: { select: { name: true } } } } },
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
   * Client report: capital gains — deliberately labeled "approximate" in
   * the frontend, not a tax-filing number. Uses a weighted-average cost
   * basis per folio (avg cost = cumulative PURCHASE/SWITCH_IN amount ÷
   * cumulative units bought so far, recomputed at each transaction), NOT
   * FIFO lot matching — real capital-gains tax rules (LTCG/STCG holding
   * periods, equity/debt classification, indexation, grandfathering) are
   * out of scope here; this gives a directionally-useful "how much have
   * you actually made" number, not a tax computation.
   *
   * realized=true: gain on REDEMPTION/SWITCH_OUT transactions that have
   * already happened. realized=false (notional): unrealized gain on
   * CURRENT holdings — current valuation minus units-held × average cost.
   */
  async getCapitalGainsReport(realized: boolean, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const folios = await prisma.folio.findMany({
      where: { distributorId, ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
      select: {
        id: true,
        folioNumber: true,
        schemeName: true,
        amcCode: true,
        balanceUnits: true,
        valuationAmount: true,
        client: { select: { id: true, name: true } },
        transactions: {
          orderBy: { transactionDate: "asc" },
          select: { transactionType: true, transactionDate: true, amount: true, units: true },
        },
      },
    });

    const rows: Array<{
      folioId: string;
      clientId: string;
      clientName: string;
      folioNumber: string;
      schemeName: string | null;
      realizedGain?: string;
      unrealizedGain?: string;
      asOfOrDate: Date | null;
    }> = [];

    for (const folio of folios) {
      let cumulativeUnits = 0;
      let cumulativeCost = 0;
      let realizedGainTotal = 0;
      let lastRedemptionDate: Date | null = null;

      for (const t of folio.transactions) {
        const units = Number(t.units ?? 0);
        const amount = Number(t.amount ?? 0);
        if (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" || t.transactionType === "BONUS") {
          cumulativeUnits += units;
          cumulativeCost += amount;
        } else if (t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT") {
          const avgCostPerUnit = cumulativeUnits > 0 ? cumulativeCost / cumulativeUnits : 0;
          const costOfUnitsSold = avgCostPerUnit * units;
          realizedGainTotal += amount - costOfUnitsSold;
          cumulativeUnits -= units;
          cumulativeCost -= costOfUnitsSold;
          lastRedemptionDate = t.transactionDate;
        }
      }

      if (realized) {
        if (realizedGainTotal !== 0 || lastRedemptionDate) {
          rows.push({
            folioId: folio.id,
            clientId: folio.client.id,
            clientName: folio.client.name,
            folioNumber: folio.folioNumber,
            schemeName: folio.schemeName,
            realizedGain: realizedGainTotal.toFixed(2),
            asOfOrDate: lastRedemptionDate,
          });
        }
      } else {
        const currentUnits = Number(folio.balanceUnits ?? cumulativeUnits);
        const currentValue = Number(folio.valuationAmount ?? 0);
        const avgCostPerUnit = cumulativeUnits > 0 ? cumulativeCost / cumulativeUnits : 0;
        const currentCostBasis = avgCostPerUnit * currentUnits;
        if (currentValue > 0 || currentCostBasis > 0) {
          rows.push({
            folioId: folio.id,
            clientId: folio.client.id,
            clientName: folio.client.name,
            folioNumber: folio.folioNumber,
            schemeName: folio.schemeName,
            unrealizedGain: (currentValue - currentCostBasis).toFixed(2),
            asOfOrDate: null,
          });
        }
      }
    }

    return rows;
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
   * Labeled as an estimate in the frontend, not authoritative.
   */
  async getSipDueReport(withinDays = 7, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const activeSips = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
        isActive: true,
        startDate: { not: null },
        ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
      },
      include: { folio: { select: { folioNumber: true, client: { select: { name: true } } } } },
    });

    const today = new Date();
    const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);
    const frequencyToDays: Record<string, number> = { MONTHLY: 30, QUARTERLY: 91, WEEKLY: 7, DAILY: 1, ANNUALLY: 365 };

    const rows: Array<{ id: string; clientName: string; folioNumber: string; sipAmount: string | null; estimatedNextDueDate: string }> = [];
    for (const sip of activeSips) {
      if (!sip.startDate) continue;
      const intervalDays = frequencyToDays[sip.frequency?.toUpperCase() ?? "MONTHLY"] ?? 30;
      let next = new Date(sip.startDate);
      while (next < today) {
        next = new Date(next.getTime() + intervalDays * 24 * 60 * 60 * 1000);
      }
      if (next <= cutoff) {
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

  /** Distributor report: active SIPs whose endDate falls within the window — real data, direct from SipRegistration.endDate. */
  async getSipExpiringReport(withinDays = 30, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const sips = await prisma.sipRegistration.findMany({
      where: {
        distributorId,
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

  /**
   * Distributor reports: STP/SWP — inferred from transaction history, NOT
   * a dedicated registration feed (unlike SIP, no WBR/MFSD report code for
   * STP/SWP mandates is ingested, so there's no standing-instruction
   * record — only the transactions a mandate produces after the fact).
   * STP = every SWITCH_IN/SWITCH_OUT transaction; SWP = every REDEMPTION.
   * Labeled clearly in the frontend as "transactions that look like
   * STP/SWP", since a one-off manual switch/redemption is
   * indistinguishable from a systematic one in this data.
   */
  async getStpReport(page: number, requestedArnProfileIds?: string[]) {
    return this.getTransactionsByTypeReport(["SWITCH_IN", "SWITCH_OUT"], page, requestedArnProfileIds);
  }

  async getSwpReport(page: number, requestedArnProfileIds?: string[]) {
    return this.getTransactionsByTypeReport(["REDEMPTION"], page, requestedArnProfileIds);
  }

  private async getTransactionsByTypeReport(types: string[], page: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(requestedArnProfileIds);
    const where = {
      distributorId,
      transactionType: { in: types },
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
   * Distributor report: per-client XIRR — a standard Newton-Raphson XIRR
   * over every PURCHASE/SWITCH_IN (negative cash flow) and
   * REDEMPTION/SWITCH_OUT (positive cash flow) transaction, plus current
   * valuation as a final positive cash flow "as if sold today". Skips
   * clients with fewer than 2 cash flows (XIRR needs at least one outflow
   * and one inflow) or where Newton-Raphson doesn't converge, rather than
   * returning a misleading number.
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
            valuationAmount: true,
            transactions: { select: { transactionType: true, transactionDate: true, amount: true } },
          },
        },
      },
    });

    const results: Array<{ clientId: string; clientName: string; xirr: string | null; currentValue: string; totalInvested: string }> = [];
    for (const c of clients) {
      const cashFlows: Array<{ date: Date; amount: number }> = [];
      let totalInvested = 0;
      for (const f of c.folios) {
        for (const t of f.transactions) {
          const amount = Number(t.amount ?? 0);
          if (amount === 0) continue;
          if (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN") {
            cashFlows.push({ date: t.transactionDate, amount: -amount });
            totalInvested += amount;
          } else if (t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT") {
            cashFlows.push({ date: t.transactionDate, amount });
          }
        }
      }
      const currentValue = c.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0);
      if (currentValue > 0) {
        cashFlows.push({ date: new Date(), amount: currentValue });
      }

      const xirr = cashFlows.length >= 2 ? computeXirr(cashFlows) : null;
      results.push({
        clientId: c.id,
        clientName: c.name,
        xirr: xirr !== null ? (xirr * 100).toFixed(2) : null,
        currentValue: currentValue.toString(),
        totalInvested: totalInvested.toString(),
      });
    }

    return results.sort((a, b) => Number(b.currentValue) - Number(a.currentValue));
  }
}

/** Newton-Raphson XIRR — returns null (never NaN/Infinity) if it doesn't converge within 100 iterations, rather than a garbage number. */
function computeXirr(cashFlows: Array<{ date: Date; amount: number }>): number | null {
  if (cashFlows.length < 2) return null;
  const t0 = cashFlows[0].date.getTime();
  const years = cashFlows.map((cf) => (cf.date.getTime() - t0) / (365 * 24 * 60 * 60 * 1000));

  function npv(rate: number): number {
    return cashFlows.reduce((sum, cf, i) => sum + cf.amount / Math.pow(1 + rate, years[i]), 0);
  }
  function npvDerivative(rate: number): number {
    return cashFlows.reduce((sum, cf, i) => sum - (years[i] * cf.amount) / Math.pow(1 + rate, years[i] + 1), 0);
  }

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate);
    const derivative = npvDerivative(rate);
    if (Math.abs(derivative) < 1e-10) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate)) break;
    if (Math.abs(nextRate - rate) < 1e-7) {
      return nextRate;
    }
    rate = nextRate;
  }
  return Number.isFinite(rate) && Math.abs(npv(rate)) < 1 ? rate : null;
}
