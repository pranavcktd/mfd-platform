import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { ClientTenantContext } from "../client-tenant/client-tenant-context";
import { computeFolioInvestedAmount } from "../reports/cost-basis";
import { resolveDisplayAmcName } from "../reports/amc-display-name";

function mapFolio(f: {
  id: string;
  schemeName: string | null;
  amcCode: string;
  folioNumber: string;
  schemeCode: string;
  assetClass: string | null;
  balanceUnits: unknown;
  valuationAmount: unknown;
  navPerUnit: unknown;
  balanceAsOfDate: Date | null;
  source: string;
  rtaType: string | null;
  sipRegistrations?: Array<{ isActive: boolean }>;
  transactions?: Array<{ transactionType: string; amount: unknown; units: unknown; isRejection: boolean }>;
}) {
  return {
    id: f.id,
    schemeName: f.schemeName,
    amcCode: f.amcCode,
    amcName: resolveDisplayAmcName(f.schemeName, f.amcCode, f.rtaType),
    folioNumber: f.folioNumber,
    schemeCode: f.schemeCode,
    assetClass: f.assetClass,
    balanceUnits: f.balanceUnits?.toString() ?? null,
    valuationAmount: f.valuationAmount?.toString() ?? null,
    investedAmount: computeFolioInvestedAmount(f.transactions ?? []).toFixed(2),
    navPerUnit: f.navPerUnit?.toString() ?? null,
    balanceAsOfDate: f.balanceAsOfDate,
    activeSips: f.sipRegistrations?.filter((s) => s.isActive).length ?? 0,
    source: f.source,
  };
}

@Injectable()
export class ClientPortalService {
  /**
   * A full self-service portfolio view — same shape of data the MFD sees
   * on this client's own CRM detail page (CrmService.getClientDetail),
   * just scoped to "yourself" instead of taking a clientId param. Family
   * member details are the one exception: only returned if this client is
   * the family's designated head (Family.headClientId) — every other
   * family member only ever sees their own data, per the explicit "he can
   * see all member details too" (the head, not everyone) design.
   */
  async getMe() {
    const { clientId } = ClientTenantContext.current();
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      include: {
        family: true,
        folios: {
          orderBy: { valuationAmount: "desc" },
          include: {
            sipRegistrations: { select: { isActive: true } },
            transactions: {
              orderBy: { transactionDate: "asc" },
              select: { transactionType: true, amount: true, units: true, isRejection: true },
            },
          },
        },
        otherAssets: { orderBy: { asOfDate: "desc" } },
        nominees: { orderBy: { createdAt: "asc" } },
        bankAccounts: { orderBy: { createdAt: "asc" } },
      },
    });

    const folioIds = client.folios.map((f) => f.id);
    const recentTransactions = await prisma.transaction.findMany({
      where: { folioId: { in: folioIds } },
      orderBy: { transactionDate: "desc" },
      take: 20,
      include: { folio: { select: { folioNumber: true, schemeName: true } } },
    });

    const totalAum = client.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0);
    const allocationByClass = new Map<string, number>();
    for (const f of client.folios) {
      if (!f.assetClass || !f.valuationAmount) continue;
      allocationByClass.set(f.assetClass, (allocationByClass.get(f.assetClass) ?? 0) + Number(f.valuationAmount));
    }
    const assetAllocation = Array.from(allocationByClass.entries())
      .map(([assetClass, aum]) => ({
        assetClass,
        aum: aum.toString(),
        percentOfTotal: totalAum > 0 ? ((aum / totalAum) * 100).toFixed(1) : "0",
      }))
      .sort((a, b) => Number(b.aum) - Number(a.aum));

    const isHead = client.family?.headClientId === client.id;
    let familyMembers: Array<{ id: string; name: string; totalAum: string; isSelf: boolean }> | null = null;

    if (isHead && client.familyId) {
      const members = await prisma.client.findMany({
        where: { familyId: client.familyId },
        include: { folios: { select: { valuationAmount: true } } },
      });
      familyMembers = members.map((m) => ({
        id: m.id,
        name: m.name,
        totalAum: m.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0).toString(),
        isSelf: m.id === client.id,
      }));
    }

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
      panNumber: client.panNumber,
      dateOfBirth: client.dateOfBirth,
      kycStatus: client.kycStatus,
      address1: client.address1,
      address2: client.address2,
      city: client.city,
      pincode: client.pincode,
      taxStatus: client.taxStatus,
      bankAccountNumber: client.bankAccountNumber,
      bankName: client.bankName,
      bankAccounts: client.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        ifscCode: b.ifscCode,
        branchName: b.branchName,
        source: b.source,
      })),
      nominees: client.nominees.map((n) => ({
        id: n.id,
        nomineeName: n.nomineeName,
        relation: n.relation,
        email: n.email,
        mobile: n.mobile,
        source: n.source,
      })),
      familyName: client.family?.familyName ?? null,
      isFamilyHead: isHead,
      mustChangePassword: client.mustChangePassword,
      totalAum: totalAum.toString(),
      assetAllocation,
      folios: client.folios.map(mapFolio),
      otherAssets: client.otherAssets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
        description: a.description,
        value: a.value.toString(),
        asOfDate: a.asOfDate,
        details: a.details as Record<string, unknown> | null,
      })),
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        transactionType: t.transactionType,
        transactionDescription: t.transactionDescription,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
        schemeName: t.folio.schemeName,
        folioNumber: t.folio.folioNumber,
        isRejection: t.isRejection,
        source: t.source,
      })),
      familyMembers,
    };
  }

  /** Only reachable by the family head — everyone else gets a 404, not a 403, so a member can't even confirm another member's id exists. */
  async getFamilyMemberDetail(memberId: string) {
    const { clientId } = ClientTenantContext.current();
    const self = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { family: true } });
    if (!self.family || self.family.headClientId !== self.id) {
      throw new NotFoundException("Family member not found");
    }
    const member = await prisma.client.findFirst({
      where: { id: memberId, familyId: self.familyId },
      include: {
        folios: {
          orderBy: { valuationAmount: "desc" },
          include: {
            sipRegistrations: { select: { isActive: true } },
            transactions: {
              orderBy: { transactionDate: "asc" },
              select: { transactionType: true, amount: true, units: true, isRejection: true },
            },
          },
        },
      },
    });
    if (!member) {
      throw new NotFoundException("Family member not found");
    }
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      panNumber: member.panNumber,
      totalAum: member.folios.reduce((sum, f) => sum + Number(f.valuationAmount ?? 0), 0).toString(),
      folios: member.folios.map(mapFolio),
    };
  }

  /**
   * Date-wise transaction drill-down for one folio, mirroring
   * CrmService.getFolioTransactions on the MFD side — lazy-loaded when a
   * folio row is expanded rather than embedded in getMe/getFamilyMemberDetail.
   */
  async getFolioTransactions(folioId: string) {
    const { clientId } = ClientTenantContext.current();
    return this.fetchFolioTransactions(clientId, folioId);
  }

  /** Same family-head-only gate as getFamilyMemberDetail. */
  async getFamilyMemberFolioTransactions(memberId: string, folioId: string) {
    const { clientId } = ClientTenantContext.current();
    const self = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { family: true } });
    if (!self.family || self.family.headClientId !== self.id) {
      throw new NotFoundException("Family member not found");
    }
    const member = await prisma.client.findFirst({ where: { id: memberId, familyId: self.familyId } });
    if (!member) {
      throw new NotFoundException("Family member not found");
    }
    return this.fetchFolioTransactions(memberId, folioId);
  }

  private async fetchFolioTransactions(clientId: string, folioId: string) {
    const folio = await prisma.folio.findFirst({ where: { id: folioId, clientId } });
    if (!folio) {
      throw new NotFoundException("Folio not found");
    }
    const transactions = await prisma.transaction.findMany({ where: { folioId }, orderBy: { transactionDate: "desc" } });
    return transactions.map((t) => ({
      id: t.id,
      transactionType: t.transactionType,
      transactionTypeCode: t.transactionTypeCode,
      transactionDescription: t.transactionDescription,
      transactionDate: t.transactionDate,
      amount: t.amount?.toString() ?? null,
      units: t.units?.toString() ?? null,
      navPerUnit: t.navPerUnit?.toString() ?? null,
      isRejection: t.isRejection,
      source: t.source,
    }));
  }
}
