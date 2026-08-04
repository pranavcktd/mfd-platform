import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { resolveAmcName } from "@mfd/shared";
import { TenantContext } from "../tenant/tenant-context";

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
      liveAumRows,
      totalClients,
      nonPanClients,
      activeSipAgg,
      activeSipCount,
      topAmcRows,
      topClientRows,
    ] = await Promise.all([
      prisma.folio.aggregate({ where: folioWhere, _sum: { valuationAmount: true } }),
      // Independently derived from today's real AMFI NAV × each folio's
      // last-known unit balance — not the RTA's own (often weeks-stale)
      // valuationAmount snapshot. Only sums folios whose scheme has been
      // matched to a live NAV (see nav-sync.processor.ts / Folio.isin);
      // NULL (not 0) when none have, so the frontend can distinguish
      // "genuinely zero" from "no live data yet".
      prisma.$queryRaw<Array<{ liveAum: string | null }>>`
        SELECT SUM(f.balance_units * sm.latest_nav)::text AS "liveAum"
        FROM folios f
        JOIN scheme_master sm ON sm.isin = f.isin AND sm.latest_nav IS NOT NULL
        WHERE f.distributor_id = ${distributorId}::uuid
          ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
      `,
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

    return {
      totalAum: aumAgg._sum.valuationAmount?.toString() ?? "0",
      liveAum: liveAumRows[0]?.liveAum ?? null,
      totalClients,
      nonPanClients,
      monthlySipValue: activeSipAgg._sum.sipAmount?.toString() ?? "0",
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
    return {
      totalAum: "0",
      liveAum: null,
      totalClients: 0,
      nonPanClients: 0,
      monthlySipValue: "0",
      activeSips: 0,
      topAmcs: [],
      topClients: [],
    };
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
