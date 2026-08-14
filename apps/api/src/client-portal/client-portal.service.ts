import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { ClientTenantContext } from "../client-tenant/client-tenant-context";
import { computeFolioInvestedAmount, computeXirr, computeCagr, findRepeatedTransactionIndexes } from "@mfd/shared";
import { resolveDisplayAmcName } from "../reports/amc-display-name";
import { fetchLatestNavByIsin, computeLiveValue, type SchemeNavLookup } from "../reports/live-valuation";
import { dedupeNominees } from "../crm/nominee-dedup";
import { estimateNextDueDate } from "../reports/sip-frequency";
import { ReportsService } from "../reports/reports.service";

/**
 * Same three-way current-value priority as CrmService.getClientDetail and
 * the frontend's effectiveCurrentValue (holdings-types.ts): RTA-confirmed
 * valuationAmount first, then live-NAV, then the transaction-replay
 * estimate — so a client whose folio has never received a balance report
 * yet (real case: a fresh lumpsum purchase with no WBR4/MFSD203 snapshot
 * yet) still sees a real current value instead of a blank/zero, and so the
 * portfolio-level gain/XIRR/CAGR below is computed from EXACTLY the number
 * each folio card shows, not a narrower one.
 */
function mapFolio(
  f: {
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
    isin: string | null;
    estimatedBalanceUnits?: unknown;
    estimatedValuationAmount?: unknown;
    sipRegistrations?: Array<{ isActive: boolean; registrationType?: string | null }>;
    transactions?: Array<{ transactionType: string; amount: unknown; units: unknown; transactionDate?: Date; isRejection: boolean }>;
  },
  navByIsin: Map<string, SchemeNavLookup>,
) {
  const effectiveUnitsForLiveNav = f.balanceUnits ?? f.estimatedBalanceUnits;
  const liveValueResult = computeLiveValue(effectiveUnitsForLiveNav, navByIsin.get(f.isin ?? ""));
  const investedAmount = computeFolioInvestedAmount(f.transactions ?? [], f.balanceUnits ? Number(f.balanceUnits) : null);
  const effectiveValue =
    f.valuationAmount !== null
      ? Number(f.valuationAmount)
      : liveValueResult.liveValue !== null
        ? Number(liveValueResult.liveValue)
        : Number(f.estimatedValuationAmount ?? 0);
  const cashFlows = (f.transactions ?? [])
    .filter(
      (t) =>
        !t.isRejection &&
        Number(t.amount ?? 0) !== 0 &&
        t.transactionDate &&
        (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" || t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT"),
    )
    .map((t) => ({
      date: t.transactionDate as Date,
      amount: t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" ? -Number(t.amount) : Number(t.amount),
    }));

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
    investedAmount: investedAmount.toFixed(2),
    navPerUnit: f.navPerUnit?.toString() ?? null,
    balanceAsOfDate: f.balanceAsOfDate,
    ...liveValueResult,
    estimatedBalanceUnits: f.estimatedBalanceUnits?.toString() ?? null,
    estimatedValuationAmount: f.estimatedValuationAmount?.toString() ?? null,
    activeSips: f.sipRegistrations?.filter((s) => s.isActive).length ?? 0,
    activeRegistrationTypes: Array.from(
      new Set((f.sipRegistrations ?? []).filter((s) => s.isActive && s.registrationType).map((s) => s.registrationType as string)),
    ),
    source: f.source,
    // Internal-only, stripped by the caller before returning to the client — feeds the portfolio-level gain/XIRR/CAGR summary.
    _effectiveValue: effectiveValue,
    _cashFlows: cashFlows,
  };
}

/** Portfolio-level gain/XIRR/CAGR from a set of mapFolio results — shared by getMe and getFamilyMemberDetail so both see the same real numbers the MFD's own CRM computes, not a narrower client-portal-only view. */
function computeAggregateReturns(mappedFolios: Array<ReturnType<typeof mapFolio>>) {
  const totalCurrentValue = mappedFolios.reduce((sum, f) => sum + f._effectiveValue, 0);
  const totalInvestedValue = mappedFolios.reduce((sum, f) => sum + Number(f.investedAmount), 0);
  const gain = totalCurrentValue - totalInvestedValue;
  const rawCashFlows = mappedFolios.flatMap((f) => f._cashFlows);
  const cashFlows = [...rawCashFlows];
  if (totalCurrentValue > 0) cashFlows.push({ date: new Date(), amount: totalCurrentValue });
  const xirr = cashFlows.length >= 2 ? computeXirr(cashFlows) : null;
  const firstInvestmentDate = rawCashFlows.length ? new Date(Math.min(...rawCashFlows.map((cf) => cf.date.getTime()))) : null;
  const cagr = firstInvestmentDate ? computeCagr(totalInvestedValue, totalCurrentValue, firstInvestmentDate) : null;
  return {
    totalCurrentValue: totalCurrentValue.toFixed(2),
    totalInvestedValue: totalInvestedValue.toFixed(2),
    gain: gain.toFixed(2),
    absoluteReturnPercent: totalInvestedValue > 0.01 ? ((gain / totalInvestedValue) * 100).toFixed(2) : null,
    xirr: xirr !== null ? (xirr * 100).toFixed(2) : null,
    cagr: cagr !== null ? (cagr * 100).toFixed(2) : null,
  };
}

function stripInternalFields<T extends { _effectiveValue: number; _cashFlows: unknown }>(f: T): Omit<T, "_effectiveValue" | "_cashFlows"> {
  const { _effectiveValue, _cashFlows, ...rest } = f;
  return rest;
}

@Injectable()
export class ClientPortalService {
  private static readonly TRANSACTIONS_PAGE_SIZE = 20;

  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Paginated, searchable transaction history across every folio — mirrors
   * CrmService.getClientTransactions exactly (same page size, same search
   * fields), just scoped to "yourself" via ClientTenantContext instead of a
   * clientId param. Replaces getMe's old hard-capped 20-row
   * recentTransactions for anyone who actually wants to browse/search their
   * full history, not just glance at the newest few.
   */
  async getMyTransactions(page: number, search?: string) {
    const { clientId } = ClientTenantContext.current();

    const where = {
      folio: { clientId },
      ...(search
        ? {
            OR: [
              { folio: { schemeName: { contains: search, mode: Prisma.QueryMode.insensitive } } },
              { transactionDescription: { contains: search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (page - 1) * ClientPortalService.TRANSACTIONS_PAGE_SIZE,
        take: ClientPortalService.TRANSACTIONS_PAGE_SIZE,
        include: { folio: { select: { schemeName: true, folioNumber: true, amcCode: true, schemeCode: true } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize: ClientPortalService.TRANSACTIONS_PAGE_SIZE,
      transactions: transactions.map((t) => ({
        id: t.id,
        schemeName: t.folio.schemeName,
        folioNumber: t.folio.folioNumber,
        amcCode: t.folio.amcCode,
        schemeCode: t.folio.schemeCode,
        transactionType: t.transactionType,
        transactionDescription: t.transactionDescription,
        transactionDate: t.transactionDate,
        amount: t.amount?.toString() ?? null,
        units: t.units?.toString() ?? null,
        navPerUnit: t.navPerUnit?.toString() ?? null,
        isRejection: t.isRejection,
        source: t.source,
      })),
    };
  }

  /**
   * Every SIP/STP/SWP registration this client has (active + ceased) —
   * mirrors CrmService.getClientSystematicInvestments exactly (same scheme-
   * name-fallback logic via SchemeMaster, same estimated-next-due-date
   * math), just scoped to "yourself" instead of a clientId param. Feeds the
   * shared SystematicInvestmentsExplorer component the CRM side also uses.
   */
  async getMySystematicInvestments() {
    const { clientId, distributorId } = ClientTenantContext.current();
    const registrations = await prisma.sipRegistration.findMany({
      where: { distributorId, folio: { clientId } },
      orderBy: [{ isActive: "desc" }, { registrationDate: "desc" }],
      include: { folio: { select: { folioNumber: true, amcCode: true, schemeName: true, schemeCode: true } } },
    });

    const missingNamePairs = registrations
      .filter((r) => !r.folio.schemeName && r.folio.amcCode && r.schemeCode)
      .map((r) => ({ amcCode: r.folio.amcCode, schemeCode: r.schemeCode! }));
    const schemeMasters = missingNamePairs.length
      ? await prisma.schemeMaster.findMany({
          where: { OR: missingNamePairs.map((p) => ({ amcCode: p.amcCode, schemeCode: p.schemeCode })) },
          select: { amcCode: true, schemeCode: true, schemeName: true },
        })
      : [];
    const schemeNameByCode = new Map(schemeMasters.map((s) => [`${s.amcCode}|${s.schemeCode}`, s.schemeName]));

    const today = new Date();
    return registrations.map((r) => ({
      id: r.id,
      folioNumber: r.folio.folioNumber,
      amcCode: r.folio.amcCode,
      schemeName: r.folio.schemeName ?? (r.schemeCode ? schemeNameByCode.get(`${r.folio.amcCode}|${r.schemeCode}`) : undefined) ?? r.schemeCode,
      sipAmount: r.sipAmount?.toString() ?? null,
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate,
      registrationDate: r.registrationDate,
      ceaseDate: r.ceaseDate,
      isActive: r.isActive,
      registrationType: r.registrationType,
      estimatedNextDueDate: r.isActive && r.startDate ? estimateNextDueDate(r.startDate, r.frequency, today)?.toISOString().slice(0, 10) ?? null : null,
    }));
  }

  /**
   * Real min/max transaction date for this client — bounds which financial
   * years actually make sense to offer in the capital gains FY picker.
   * Mirrors ReportsService.getClientTransactionDateRange, scoped to
   * "yourself" via ClientTenantContext.
   */
  async getMyTransactionDateRange() {
    const { clientId, distributorId } = ClientTenantContext.current();
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
   * Capital gains — reuses ReportsService's real FIFO lot-matching/tax
   * engine directly (not a re-implementation) rather than duplicating that
   * ~200-line computation a second time; see getCapitalGainsReport's own
   * doc comment for why overrideDistributorId is needed here (client-portal
   * requests run under ClientTenantContext, not TenantContext). Always
   * scoped to "yourself" (own clientId), never ARN-filtered — a client
   * isn't ARN-scoped, they only ever see their own folios regardless.
   */
  async getMyCapitalGains(realized: boolean, fyStartDate?: Date, fyEndDate?: Date) {
    const { clientId, distributorId } = ClientTenantContext.current();
    return this.reportsService.getCapitalGainsReport(realized, undefined, clientId, fyStartDate, fyEndDate, distributorId);
  }

  /** Line-by-line FIFO lot detail — see getMyCapitalGains and ReportsService.getCapitalGainsDetailReport's own doc comments. */
  async getMyCapitalGainsDetail(realized: boolean, fyStartDate?: Date, fyEndDate?: Date) {
    const { clientId, distributorId } = ClientTenantContext.current();
    return this.reportsService.getCapitalGainsDetailReport(realized, undefined, clientId, fyStartDate, fyEndDate, distributorId);
  }

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
            sipRegistrations: { select: { isActive: true, registrationType: true } },
            transactions: {
              orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
              select: { transactionType: true, amount: true, units: true, transactionDate: true, isRejection: true },
            },
          },
        },
        otherAssets: { orderBy: { asOfDate: "desc" } },
        nominees: { orderBy: { createdAt: "asc" } },
        bankAccounts: { orderBy: { createdAt: "asc" } },
      },
    });

    const navByIsin = await fetchLatestNavByIsin(client.folios.map((f) => f.isin));
    const mappedFolios = client.folios.map((f) => mapFolio(f, navByIsin));
    const aggregateReturns = computeAggregateReturns(mappedFolios);
    const folioIds = client.folios.map((f) => f.id);
    const recentTransactions = await prisma.transaction.findMany({
      where: { folioId: { in: folioIds } },
      orderBy: { transactionDate: "desc" },
      take: 20,
      include: { folio: { select: { folioNumber: true, schemeName: true, amcCode: true, schemeCode: true } } },
    });

    // Effective-value based (RTA-confirmed, else live-NAV, else transaction-
    // replay estimate — see mapFolio's own doc comment), not a raw
    // valuationAmount-only sum: a folio with only an estimated value would
    // otherwise silently drop out of both the total and the allocation
    // breakdown, undercounting a real client's real portfolio.
    const totalAum = mappedFolios.reduce((sum, f) => sum + f._effectiveValue, 0);
    const allocationByClass = new Map<string, number>();
    for (let i = 0; i < client.folios.length; i++) {
      const assetClass = client.folios[i].assetClass;
      const value = mappedFolios[i]._effectiveValue;
      if (!assetClass || value === 0) continue;
      allocationByClass.set(assetClass, (allocationByClass.get(assetClass) ?? 0) + value);
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
      ...aggregateReturns,
      bankAccountNumber: client.bankAccountNumber,
      bankName: client.bankName,
      // Dedupe by real account identity, not row — see crm.service.ts's
      // getClientDetail for why the same real account can carry one row per
      // folio it's reported against.
      bankAccounts: client.bankAccounts
        .filter(
          (b, i, arr) =>
            arr.findIndex((o) => o.bankName === b.bankName && o.accountNumber === b.accountNumber && o.ifscCode === b.ifscCode) === i,
        )
        .map((b) => ({
          id: b.id,
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          ifscCode: b.ifscCode,
          branchName: b.branchName,
          source: b.source,
        })),
      // Same per-folio duplication risk as bankAccounts above, plus real
      // casing/completeness variance across CAMS reports — see
      // dedupeNominees's doc comment.
      nominees: dedupeNominees(client.nominees).map((n) => ({
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
      folios: mappedFolios.map(stripInternalFields),
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
        navPerUnit: t.navPerUnit?.toString() ?? null,
        schemeName: t.folio.schemeName,
        folioNumber: t.folio.folioNumber,
        amcCode: t.folio.amcCode,
        schemeCode: t.folio.schemeCode,
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
            sipRegistrations: { select: { isActive: true, registrationType: true } },
            transactions: {
              orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
              select: { transactionType: true, amount: true, units: true, transactionDate: true, isRejection: true },
            },
          },
        },
      },
    });
    if (!member) {
      throw new NotFoundException("Family member not found");
    }
    const navByIsin = await fetchLatestNavByIsin(member.folios.map((f) => f.isin));
    const mappedFolios = member.folios.map((f) => mapFolio(f, navByIsin));
    const aggregateReturns = computeAggregateReturns(mappedFolios);
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      panNumber: member.panNumber,
      ...aggregateReturns,
      totalAum: aggregateReturns.totalCurrentValue,
      folios: mappedFolios.map(stripInternalFields),
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

  /** Real-data dedup, same reasoning as CrmService.getFolioTransactions's own doc comment — investors shouldn't see mass-reissue duplicate rows any more than the MFD should. */
  private async fetchFolioTransactions(clientId: string, folioId: string) {
    const folio = await prisma.folio.findFirst({ where: { id: folioId, clientId } });
    if (!folio) {
      throw new NotFoundException("Folio not found");
    }
    const transactions = await prisma.transaction.findMany({ where: { folioId }, orderBy: [{ transactionDate: "asc" }, { id: "asc" }] });
    const duplicateIndexes = findRepeatedTransactionIndexes(transactions);
    return transactions
      .filter((_, i) => !duplicateIndexes.has(i))
      .reverse()
      .map((t) => ({
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
