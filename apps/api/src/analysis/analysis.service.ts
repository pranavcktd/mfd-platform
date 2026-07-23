import { Injectable } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

@Injectable()
export class AnalysisService {
  /**
   * Real analysis buildable from CURRENT data only — no NAV/benchmark time
   * series exists (see [[mfd_frontend]] / [[mfd_ingestion_engine]]), so
   * rolling returns and benchmark comparison are still not possible. This
   * covers what genuinely is: asset-class allocation (from CAMS's
   * SCHEME_TYP / KFintech's AssetType, captured from real transaction
   * data), portfolio concentration, and SIP vs. lumpsum contribution mix.
   */
  async getSummary() {
    const distributorId = TenantContext.currentDistributorId();

    const [assetClassRows, totalAgg, topFolios, activeSipAgg, allFolioAum] = await Promise.all([
      prisma.folio.groupBy({
        by: ["assetClass"],
        where: { distributorId, valuationAmount: { not: null }, assetClass: { not: null } },
        _sum: { valuationAmount: true },
        _count: true,
      }),
      prisma.folio.aggregate({
        where: { distributorId, valuationAmount: { not: null } },
        _sum: { valuationAmount: true },
      }),
      prisma.folio.findMany({
        where: { distributorId, valuationAmount: { not: null } },
        orderBy: { valuationAmount: "desc" },
        take: 10,
        select: {
          id: true,
          schemeName: true,
          amcCode: true,
          schemeCode: true,
          valuationAmount: true,
          client: { select: { name: true } },
        },
      }),
      prisma.sipRegistration.aggregate({
        where: { distributorId, isActive: true },
        _sum: { sipAmount: true },
      }),
      prisma.folio.aggregate({
        where: { distributorId, valuationAmount: { not: null } },
        _count: true,
      }),
    ]);

    const totalAum = Number(totalAgg._sum.valuationAmount ?? 0);
    const classifiedAum = assetClassRows.reduce((sum, r) => sum + Number(r._sum.valuationAmount ?? 0), 0);
    // Clamp to 0 below a rupee — totalAum/classifiedAum are both sums of many
    // Decimal values converted through JS Number(), so a floating-point
    // subtraction of two large near-equal sums can land on a tiny negative
    // artifact (e.g. -6e-8) instead of exactly 0.
    const unclassifiedAum = Math.abs(totalAum - classifiedAum) < 1 ? 0 : totalAum - classifiedAum;

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
      topConcentration: topFolios.map((f) => ({
        clientName: f.client.name,
        schemeName: f.schemeName ?? `${f.amcCode}/${f.schemeCode}`,
        aum: f.valuationAmount?.toString() ?? "0",
        percentOfTotal: totalAum > 0 ? ((Number(f.valuationAmount ?? 0) / totalAum) * 100).toFixed(1) : "0",
      })),
      activeSipMonthlyValue: activeSipAgg._sum.sipAmount?.toString() ?? "0",
      valuedFolioCount: allFolioAum._count,
    };
  }
}
