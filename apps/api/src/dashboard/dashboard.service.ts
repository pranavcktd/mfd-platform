import { Injectable } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

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
    const sipWhere = {
      distributorId,
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
      aumAgg,
      totalClients,
      nonPanClients,
      activeSipAgg,
      activeSipCount,
      topAmcRows,
      topClientRows,
      recentClients,
    ] = await Promise.all([
      prisma.folio.aggregate({ where: folioWhere, _sum: { valuationAmount: true } }),
      prisma.client.count({ where: clientWhere }),
      prisma.client.count({ where: { ...clientWhere, panNumber: null } }),
      prisma.sipRegistration.aggregate({ where: sipWhere, _sum: { sipAmount: true } }),
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
      prisma.client.findMany({
        where: clientWhere,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, name: true, createdAt: true },
      }),
    ]);

    const topClientIds = topClientRows.map((r) => r.clientId);
    const topClientNames = await prisma.client.findMany({
      where: { id: { in: topClientIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(topClientNames.map((c) => [c.id, c.name]));

    // Real scheme names captured from the RTA (not a fabricated AMC-name
    // mapping — no reference file for that exists) as a naming hint next to
    // the bare amcCode, same approach as reports.service.ts's AUM report.
    const sampleNames = await prisma.folio.findMany({
      where: { ...folioWhere, amcCode: { in: topAmcRows.map((r) => r.amcCode) }, schemeName: { not: null } },
      distinct: ["amcCode"],
      select: { amcCode: true, schemeName: true },
    });
    const schemeNameByAmc = new Map(sampleNames.map((s) => [s.amcCode, s.schemeName]));

    const recentClientDetails = await Promise.all(
      recentClients.map(async (client) => {
        const latestTx = await prisma.transaction.findFirst({
          where: {
            folio: { clientId: client.id, ...(arnScope ? { arnProfileId: { in: arnScope } } : {}) },
          },
          orderBy: { transactionDate: "desc" },
          select: { transactionType: true, transactionDescription: true, transactionDate: true },
        });
        return {
          name: client.name,
          transactionType: latestTx?.transactionDescription ?? latestTx?.transactionType ?? null,
          date: (latestTx?.transactionDate ?? client.createdAt).toISOString(),
        };
      }),
    );

    return {
      totalAum: aumAgg._sum.valuationAmount?.toString() ?? "0",
      totalClients,
      nonPanClients,
      monthlySipValue: activeSipAgg._sum.sipAmount?.toString() ?? "0",
      activeSips: activeSipCount,
      topAmcs: topAmcRows.map((r) => ({
        amcCode: r.amcCode,
        sampleSchemeName: schemeNameByAmc.get(r.amcCode) ?? null,
        aum: r._sum.valuationAmount?.toString() ?? "0",
      })),
      topClients: topClientRows.map((r) => ({
        name: nameById.get(r.clientId) ?? "Unknown",
        aum: r._sum.valuationAmount?.toString() ?? "0",
      })),
      recentClients: recentClientDetails,
    };
  }

  private emptySummary() {
    return {
      totalAum: "0",
      totalClients: 0,
      nonPanClients: 0,
      monthlySipValue: "0",
      activeSips: 0,
      topAmcs: [],
      topClients: [],
      recentClients: [],
    };
  }
}
