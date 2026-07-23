import { Injectable } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

const REPORT_LIMIT = 200;

@Injectable()
export class MisService {
  /**
   * Four compliance/hygiene checks buildable from data we actually ingest.
   * "Clients without nominee" from the original spec is deliberately
   * omitted — nominee isn't captured by any of the 4 RTA report types, so
   * showing it would mean fabricating a signal, not reporting a real gap.
   */
  async getSummary() {
    const distributorId = TenantContext.currentDistributorId();

    const [clientsWithoutFolio, nonSipClients, zeroBalanceFolios, foliosWithoutPan] = await Promise.all([
      prisma.client.findMany({
        where: { distributorId, folios: { none: {} } },
        orderBy: { createdAt: "desc" },
        take: REPORT_LIMIT,
        select: { id: true, name: true, panNumber: true, createdAt: true },
      }),
      // Two separate conditions on the same "folios" relation (has at least
      // one, AND none of them have an active SIP) can't be two keys on one
      // where object — JS would silently keep only the last. AND: [...]
      // composes them correctly.
      prisma.client.findMany({
        where: {
          distributorId,
          AND: [
            { folios: { some: {} } },
            { folios: { every: { sipRegistrations: { none: { isActive: true } } } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: REPORT_LIMIT,
        select: { id: true, name: true, panNumber: true, createdAt: true },
      }),
      prisma.folio.findMany({
        where: {
          distributorId,
          OR: [{ valuationAmount: null }, { valuationAmount: 0 }],
        },
        orderBy: { balanceAsOfDate: "desc" },
        take: REPORT_LIMIT,
        select: {
          id: true,
          folioNumber: true,
          amcCode: true,
          schemeCode: true,
          valuationAmount: true,
          balanceAsOfDate: true,
          client: { select: { name: true } },
        },
      }),
      prisma.folio.findMany({
        where: { distributorId, client: { panNumber: null } },
        orderBy: { createdAt: "desc" },
        take: REPORT_LIMIT,
        select: {
          id: true,
          folioNumber: true,
          amcCode: true,
          schemeCode: true,
          client: { select: { name: true } },
        },
      }),
    ]);

    return {
      clientsWithoutFolio: clientsWithoutFolio.map((c) => ({
        id: c.id,
        name: c.name,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
      })),
      nonSipClients: nonSipClients.map((c) => ({
        id: c.id,
        name: c.name,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
      })),
      zeroBalanceFolios: zeroBalanceFolios.map((f) => ({
        id: f.id,
        clientName: f.client.name,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeCode: f.schemeCode,
        balanceAsOfDate: f.balanceAsOfDate,
      })),
      foliosWithoutPan: foliosWithoutPan.map((f) => ({
        id: f.id,
        clientName: f.client.name,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeCode: f.schemeCode,
      })),
    };
  }
}
