import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

const PAGE_SIZE = 25;

export interface ClientListRow {
  id: string;
  name: string;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  folioCount: number;
  totalAum: string;
}

@Injectable()
export class CrmService {
  /**
   * Sorted by total AUM descending, not by createdAt — confirmed live that
   * the default "newest first" ordering surfaced a page entirely of
   * freshly-created, not-yet-valued clients (all showing ₹0), which reads
   * as "there is no data" even though real AUM is present elsewhere. AUM
   * has to be computed via a join+GROUP BY (not fetched-then-reduced in JS)
   * so the sort/pagination happens on the real aggregate, not a slice of
   * rows picked before the aggregate is known.
   */
  async listClients(search: string | undefined, page: number) {
    const distributorId = TenantContext.currentDistributorId();
    const searchFilter = search
      ? Prisma.sql`AND (c.name ILIKE ${`%${search}%`} OR c.pan_number ILIKE ${`%${search}%`} OR c.email ILIKE ${`%${search}%`})`
      : Prisma.empty;

    const clients = await prisma.$queryRaw<ClientListRow[]>`
      SELECT c.id, c.name, c.pan_number AS "panNumber", c.email, c.phone, c.created_at AS "createdAt",
             COUNT(f.id)::int AS "folioCount",
             COALESCE(SUM(f.valuation_amount), 0) AS "totalAum"
      FROM clients c
      LEFT JOIN folios f ON f.client_id = c.id
      WHERE c.distributor_id = ${distributorId}::uuid
      ${searchFilter}
      GROUP BY c.id
      ORDER BY "totalAum" DESC, c.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `;

    const [{ count: total }] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM clients c
      WHERE c.distributor_id = ${distributorId}::uuid
      ${searchFilter}
    `;

    return { total, page, pageSize: PAGE_SIZE, clients };
  }

  async getClientDetail(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({
      where: { id: clientId, distributorId },
      include: {
        family: { select: { familyName: true } },
        folios: {
          orderBy: { valuationAmount: "desc" },
          include: { sipRegistrations: { orderBy: { registrationDate: "desc" } } },
        },
        otherAssets: { orderBy: { asOfDate: "desc" } },
      },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const folioIds = client.folios.map((f) => f.id);
    const recentTransactions = await prisma.transaction.findMany({
      where: { folioId: { in: folioIds } },
      orderBy: { transactionDate: "desc" },
      take: 20,
    });

    return {
      id: client.id,
      name: client.name,
      panNumber: client.panNumber,
      email: client.email,
      phone: client.phone,
      dateOfBirth: client.dateOfBirth,
      kycStatus: client.kycStatus,
      familyName: client.family?.familyName ?? null,
      // Client master fields captured from the RTA's investor-master report
      // (CAMS WBR9 / KFintech MFSD211) — real data, previously parsed but
      // never persisted (see [[mfd_ingestion_engine]]). Nominee is
      // deliberately absent: neither RTA's investor-master export (as
      // ingested) carries a nominee field at all.
      address1: client.address1,
      address2: client.address2,
      city: client.city,
      pincode: client.pincode,
      taxStatus: client.taxStatus,
      bankAccountNumber: client.bankAccountNumber,
      bankName: client.bankName,
      createdAt: client.createdAt,
      folios: client.folios.map((f) => ({
        id: f.id,
        amcCode: f.amcCode,
        folioNumber: f.folioNumber,
        schemeCode: f.schemeCode,
        schemeName: f.schemeName,
        assetClass: f.assetClass,
        balanceUnits: f.balanceUnits?.toString() ?? null,
        valuationAmount: f.valuationAmount?.toString() ?? null,
        navPerUnit: f.navPerUnit?.toString() ?? null,
        balanceAsOfDate: f.balanceAsOfDate,
        activeSips: f.sipRegistrations.filter((s) => s.isActive).length,
      })),
      otherAssets: client.otherAssets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
        description: a.description,
        value: a.value.toString(),
        asOfDate: a.asOfDate,
      })),
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        transactionType: t.transactionType,
        transactionDescription: t.transactionDescription,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
        brokerageAmount: t.brokerageAmount?.toString() ?? null,
      })),
    };
  }
}
