import { Injectable } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

const PAGE_SIZE = 25;

@Injectable()
export class ReportsService {
  /** Distributor report: AUM broken down by AMC scheme code (full list, not just the dashboard's top 5), with one real sample scheme name per code as a naming hint. */
  async getAumReport() {
    const distributorId = TenantContext.currentDistributorId();
    const rows = await prisma.folio.groupBy({
      by: ["amcCode"],
      where: { distributorId, valuationAmount: { not: null } },
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
      sampleSchemeName: nameByAmc.get(r.amcCode) ?? null,
      folioCount: r._count,
      aum: r._sum.valuationAmount?.toString() ?? "0",
    }));
  }

  /** Distributor report: transaction register, filterable by type and date range. */
  async getTransactionsReport(params: { type?: string; from?: string; to?: string; page: number }) {
    const distributorId = TenantContext.currentDistributorId();
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
      })),
    };
  }

  /** Distributor report: SIP registrations, filterable by lifecycle status. */
  async getSipReport(status: "new" | "active" | "ceased" | undefined, page: number) {
    const distributorId = TenantContext.currentDistributorId();
    const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

    const where = {
      distributorId,
      ...(status === "new" ? { registrationDate: { gte: startOfMonth } } : {}),
      ...(status === "active" ? { isActive: true } : {}),
      ...(status === "ceased" ? { isActive: false } : {}),
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
  async getHoldingsReport(clientId: string | undefined, page: number) {
    const distributorId = TenantContext.currentDistributorId();
    const where = { distributorId, ...(clientId ? { clientId } : {}) };

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
  async getNetWorthReport(page: number) {
    const distributorId = TenantContext.currentDistributorId();

    const [total, clients] = await Promise.all([
      prisma.client.count({ where: { distributorId } }),
      prisma.client.findMany({
        where: { distributorId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          folios: { select: { valuationAmount: true } },
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
  async getValuationReport(page: number) {
    const distributorId = TenantContext.currentDistributorId();

    const [total, clients] = await Promise.all([
      prisma.client.count({ where: { distributorId, folios: { some: {} } } }),
      prisma.client.findMany({
        where: { distributorId, folios: { some: {} } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          folios: {
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
   */
  async getBrokerageSummary() {
    const distributorId = TenantContext.currentDistributorId();
    const totalAgg = await prisma.transaction.aggregate({
      where: { distributorId, brokerageAmount: { not: null } },
      _sum: { brokerageAmount: true },
      _count: true,
    });

    const byAmc = await prisma.$queryRaw<Array<{ amcCode: string; total: string; count: number }>>`
      SELECT f.amc_code AS "amcCode", COALESCE(SUM(t.brokerage_amount), 0) AS total, COUNT(t.id)::int AS count
      FROM transactions t
      JOIN folios f ON f.id = t.folio_id
      WHERE t.distributor_id = ${distributorId}::uuid AND t.brokerage_amount IS NOT NULL
      GROUP BY f.amc_code
      ORDER BY total DESC
    `;

    return {
      totalBrokerage: totalAgg._sum.brokerageAmount?.toString() ?? "0",
      transactionsWithBrokerage: totalAgg._count,
      byAmc: byAmc.map((r) => ({ amcCode: r.amcCode, total: r.total, count: r.count })),
    };
  }

  async getBrokerageTransactions(page: number) {
    const distributorId = TenantContext.currentDistributorId();
    const where = { distributorId, brokerageAmount: { not: null } };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { folio: { select: { folioNumber: true, amcCode: true, schemeName: true, client: { select: { name: true } } } } },
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
}
