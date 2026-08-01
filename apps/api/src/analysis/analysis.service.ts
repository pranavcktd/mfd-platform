import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { resolveAmcName } from "@mfd/shared";
import { TenantContext } from "../tenant/tenant-context";

export type MonthlyVolumeType = "purchase" | "redemption" | "other" | "all";

@Injectable()
export class AnalysisService {
  private static readonly ALLOWED_MONTH_RANGES = [3, 6, 12, 24, 36];

  /** Same re-intersection-against-owned-ARNs pattern used throughout this service — never trust client-supplied ARN ids directly. Returns undefined for "no filter", or a (possibly empty) real array once filtering is requested. */
  private async resolveArnScope(distributorId: string, requestedArnProfileIds?: string[]): Promise<string[] | undefined> {
    if (!requestedArnProfileIds || requestedArnProfileIds.length === 0) return undefined;
    const owned = await prisma.arnProfile.findMany({
      where: { distributorId, id: { in: requestedArnProfileIds } },
      select: { id: true },
    });
    return owned.map((a) => a.id);
  }

  /**
   * Dedicated, time-range-configurable version of the monthly transaction
   * volume chart — split out from getSummary() so the Analysis page's
   * "full view" card can let the user pick 3/6/12/24/36 months without
   * re-fetching the whole summary. Same purchase/redemption/other split and
   * "other" caveat as before (see getSummary's doc comment).
   */
  async getMonthlyVolume(months: number, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const clampedMonths = AnalysisService.ALLOWED_MONTH_RANGES.includes(months) ? months : 12;
    const arnScope = await this.resolveArnScope(distributorId, requestedArnProfileIds);
    if (arnScope && arnScope.length === 0) return [];

    const rows = await prisma.$queryRaw<
      Array<{ month: string; purchaseTotal: string; redemptionTotal: string; otherTotal: string; count: bigint }>
    >`
      SELECT to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') AS month,
             COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'PURCHASE'), 0)::text AS "purchaseTotal",
             COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'REDEMPTION'), 0)::text AS "redemptionTotal",
             COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type NOT IN ('PURCHASE', 'REDEMPTION')), 0)::text AS "otherTotal",
             COUNT(*)::bigint AS count
      FROM transactions t
      JOIN folios f ON f.id = t.folio_id
      WHERE t.distributor_id = ${distributorId}::uuid
        ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
        AND t.transaction_date >= (CURRENT_DATE - make_interval(months => ${clampedMonths}))
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      month: r.month,
      purchaseTotal: r.purchaseTotal,
      redemptionTotal: r.redemptionTotal,
      otherTotal: r.otherTotal,
      total: (Number(r.purchaseTotal) + Number(r.redemptionTotal) + Number(r.otherTotal)).toString(),
      count: Number(r.count),
    }));
  }

  /** Drill-down for one month + transaction-direction bucket from the monthly volume chart — real per-client breakdown, not just the aggregate total. */
  async getMonthlyVolumeDrilldown(month: string, type: MonthlyVolumeType, requestedArnProfileIds?: string[]) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException("Invalid month format, expected YYYY-MM");
    }
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(distributorId, requestedArnProfileIds);
    if (arnScope && arnScope.length === 0) {
      return { month, type, clients: [], totalAmount: "0", totalCount: 0 };
    }

    const typeCondition =
      type === "purchase"
        ? Prisma.sql`AND t.transaction_type = 'PURCHASE'`
        : type === "redemption"
          ? Prisma.sql`AND t.transaction_type = 'REDEMPTION'`
          : type === "other"
            ? Prisma.sql`AND t.transaction_type NOT IN ('PURCHASE', 'REDEMPTION')`
            : Prisma.empty;

    const rows = await prisma.$queryRaw<Array<{ clientId: string; clientName: string; amount: string; count: bigint }>>`
      SELECT c.id AS "clientId", c.name AS "clientName",
             SUM(t.amount)::text AS amount,
             COUNT(*)::bigint AS count
      FROM transactions t
      JOIN folios f ON f.id = t.folio_id
      JOIN clients c ON c.id = f.client_id
      WHERE t.distributor_id = ${distributorId}::uuid
        ${arnScope ? Prisma.sql`AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}
        AND to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') = ${month}
        ${typeCondition}
      GROUP BY c.id, c.name
      ORDER BY SUM(t.amount) DESC
    `;

    const clients = rows.map((r) => ({ clientId: r.clientId, clientName: r.clientName, amount: r.amount, count: Number(r.count) }));
    const totalAmount = clients.reduce((sum, c) => sum + Number(c.amount), 0).toString();
    const totalCount = clients.reduce((sum, c) => sum + c.count, 0);
    return { month, type, clients, totalAmount, totalCount };
  }

  /**
   * Real analysis buildable from CURRENT data only — no NAV/benchmark time
   * series exists (see [[mfd_frontend]] / [[mfd_ingestion_engine]]), so
   * rolling returns and benchmark comparison are still not possible. This
   * covers what genuinely is: asset-class allocation, AMC allocation (using
   * resolveAmcName rather than a bare RTA code), portfolio concentration
   * (folio- and client-level, both with drill-down ids), ARN-wise AUM split,
   * and SIP contribution mix. Monthly transaction volume moved to its own
   * dedicated getMonthlyVolume()/getMonthlyVolumeDrilldown() so the
   * Analysis page's chart can pick its own time range independently of the
   * rest of this summary.
   *
   * Same requestedArnProfileIds scoping pattern as DashboardService: always
   * re-intersected against the tenant's own ArnProfile rows, never trusted
   * as-is, and an empty intersection returns a zeroed summary rather than
   * silently falling back to unfiltered data.
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

    const folioWhere = {
      distributorId,
      valuationAmount: { not: null },
      ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
    };
    const sipWhere = {
      distributorId,
      isActive: true,
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };
    const txnWhere = {
      distributorId,
      ...(arnScope ? { folio: { arnProfileId: { in: arnScope } } } : {}),
    };

    const [
      assetClassRows,
      amcRows,
      totalAgg,
      topFolios,
      topClientRows,
      activeSipAgg,
      arnRows,
      valuedFolioCount,
    ] = await Promise.all([
      prisma.folio.groupBy({
        by: ["assetClass"],
        where: { ...folioWhere, assetClass: { not: null } },
        _sum: { valuationAmount: true },
        _count: true,
      }),
      prisma.folio.groupBy({
        by: ["amcCode"],
        where: folioWhere,
        _sum: { valuationAmount: true },
        _count: true,
      }),
      prisma.folio.aggregate({ where: folioWhere, _sum: { valuationAmount: true } }),
      prisma.folio.findMany({
        where: folioWhere,
        orderBy: { valuationAmount: "desc" },
        take: 10,
        select: {
          id: true,
          schemeName: true,
          amcCode: true,
          schemeCode: true,
          valuationAmount: true,
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.folio.groupBy({
        by: ["clientId"],
        where: folioWhere,
        _sum: { valuationAmount: true },
        orderBy: { _sum: { valuationAmount: "desc" } },
        take: 10,
      }),
      prisma.sipRegistration.aggregate({ where: sipWhere, _sum: { sipAmount: true } }),
      // Only meaningful with >=2 ARNs on the account (parent + child) —
      // the frontend hides this card entirely for a single-ARN MFD.
      prisma.folio.groupBy({
        by: ["arnProfileId"],
        where: { ...folioWhere, arnProfileId: { not: null } },
        _sum: { valuationAmount: true },
      }),
      prisma.folio.count({ where: folioWhere }),
    ]);

    const totalAum = Number(totalAgg._sum.valuationAmount ?? 0);
    const classifiedAum = assetClassRows.reduce((sum, r) => sum + Number(r._sum.valuationAmount ?? 0), 0);
    // Clamp to 0 below a rupee — totalAum/classifiedAum are both sums of many
    // Decimal values converted through JS Number(), so a floating-point
    // subtraction of two large near-equal sums can land on a tiny negative
    // artifact (e.g. -6e-8) instead of exactly 0.
    const unclassifiedAum = Math.abs(totalAum - classifiedAum) < 1 ? 0 : totalAum - classifiedAum;

    const sampleNames = await prisma.folio.findMany({
      where: { ...folioWhere, amcCode: { in: amcRows.map((r) => r.amcCode) }, schemeName: { not: null } },
      distinct: ["amcCode"],
      select: { amcCode: true, schemeName: true },
    });
    const schemeNameByAmc = new Map(sampleNames.map((s) => [s.amcCode, s.schemeName]));

    const topClientIds = topClientRows.map((r) => r.clientId);
    const clients = await prisma.client.findMany({ where: { id: { in: topClientIds } }, select: { id: true, name: true } });
    const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

    const arnProfileIds = arnRows.map((r) => r.arnProfileId).filter((id): id is string => id !== null);
    const arnProfiles = await prisma.arnProfile.findMany({
      where: { id: { in: arnProfileIds } },
      select: { id: true, arnNumber: true, parentArnProfileId: true },
    });
    const arnByid = new Map(arnProfiles.map((a) => [a.id, a]));

    return {
      totalAum: totalAum.toString(),
      unclassifiedAum: unclassifiedAum.toString(),
      assetAllocation: assetClassRows
        .map((r) => ({
          assetClass: r.assetClass as string,
          aum: r._sum.valuationAmount?.toString() ?? "0",
          folioCount: r._count,
          percentOfTotal: totalAum > 0 ? ((Number(r._sum.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
        }))
        .sort((a, b) => Number(b.aum) - Number(a.aum)),
      amcAllocation: amcRows
        .map((r) => ({
          amcCode: r.amcCode,
          amcName: resolveAmcName(schemeNameByAmc.get(r.amcCode), r.amcCode),
          aum: r._sum.valuationAmount?.toString() ?? "0",
          folioCount: r._count,
          percentOfTotal: totalAum > 0 ? ((Number(r._sum.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
        }))
        .sort((a, b) => Number(b.aum) - Number(a.aum)),
      topConcentration: topFolios.map((f) => ({
        clientId: f.client.id,
        clientName: f.client.name,
        schemeName: f.schemeName ?? `${f.amcCode}/${f.schemeCode}`,
        aum: f.valuationAmount?.toString() ?? "0",
        percentOfTotal: totalAum > 0 ? ((Number(f.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
      })),
      topClients: topClientRows.map((r) => ({
        clientId: r.clientId,
        clientName: clientNameById.get(r.clientId) ?? "Unknown",
        aum: r._sum.valuationAmount?.toString() ?? "0",
        percentOfTotal: totalAum > 0 ? ((Number(r._sum.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
      })),
      arnSplit: arnRows
        .map((r) => {
          const arn = r.arnProfileId ? arnByid.get(r.arnProfileId) : undefined;
          return {
            arnProfileId: r.arnProfileId,
            arnNumber: arn?.arnNumber ?? "Unknown",
            isChild: Boolean(arn?.parentArnProfileId),
            aum: r._sum.valuationAmount?.toString() ?? "0",
            percentOfTotal: totalAum > 0 ? ((Number(r._sum.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
          };
        })
        .sort((a, b) => Number(b.aum) - Number(a.aum)),
      activeSipMonthlyValue: activeSipAgg._sum.sipAmount?.toString() ?? "0",
      valuedFolioCount,
    };
  }

  private emptySummary() {
    return {
      totalAum: "0",
      unclassifiedAum: "0",
      assetAllocation: [],
      amcAllocation: [],
      topConcentration: [],
      topClients: [],
      arnSplit: [],
      activeSipMonthlyValue: "0",
      valuedFolioCount: 0,
    };
  }
}
