import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Prisma, prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { computeFolioInvestedAmount, computeXirr, computeCagr, findRepeatedTransactionIndexes } from "@mfd/shared";
import { resolveDisplayAmcName } from "../reports/amc-display-name";
import { fetchLatestNavByIsin, computeLiveValue } from "../reports/live-valuation";
import { estimateNextDueDate } from "../reports/sip-frequency";
import { sendPortalLoginEmail } from "./portal-login-email";
import { dedupeNominees } from "./nominee-dedup";

const PAGE_SIZE = 25;
const BCRYPT_ROUNDS = 12;
const DEFAULT_PORTAL_PASSWORD = "Client@123";

export interface ClientListRow {
  id: string;
  name: string;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  folioCount: number;
  totalAum: string;
  totalInvested: string;
  gain: string;
  absoluteReturnPercent: string | null;
  xirr: string | null;
  /** Approximate — see computeCagr's doc comment (packages/shared/src/reports/xirr.ts) for why this differs from xirr on a multi-purchase folio. */
  cagr: string | null;
  needsReview: boolean;
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
  async listClients(
    search: string | undefined,
    page: number,
    filters?: { amcCode?: string; assetClass?: string; arnProfileIds?: string[] },
  ) {
    const distributorId = TenantContext.currentDistributorId();
    // arnProfileIds is untrusted request input — re-intersected against the
    // tenant's own ArnProfile rows before use, same pattern as
    // Dashboard/Analysis/Reports services.
    let arnScope: string[] | undefined;
    if (filters?.arnProfileIds && filters.arnProfileIds.length > 0) {
      const owned = await prisma.arnProfile.findMany({
        where: { distributorId, id: { in: filters.arnProfileIds } },
        select: { id: true },
      });
      arnScope = owned.map((a) => a.id);
    }

    const searchFilter = search
      ? Prisma.sql`AND (c.name ILIKE ${`%${search}%`} OR c.pan_number ILIKE ${`%${search}%`} OR c.email ILIKE ${`%${search}%`} OR c.phone ILIKE ${`%${search}%`})`
      : Prisma.empty;
    // Drill-down from Analysis's AMC/asset-class allocation cards (or an
    // explicit ARN filter) — only clients who actually hold a folio matching
    // the filter, via an INNER JOIN swap-in below (the unfiltered case keeps
    // the LEFT JOIN so zero-folio clients still show up with a ₹0 row, and
    // so CAS-imported "external, not mapped to any ARN" folios still count
    // toward totalAum/folioCount when no ARN filter is active — narrowing to
    // one specific ARN naturally excludes them, since they carry no
    // arnProfileId at all, same as every other ARN-scoped report).
    // Leading space on each fragment — concatenated with no separator, so
    // combining both filters without it would collapse into one token (e.g.
    // "...code = 'X'AND f.asset_class") and break the SQL parser. Same class
    // of bug hit (and fixed) in reports.service.ts's brokerage summary.
    const holdingFilter = Prisma.sql`${filters?.amcCode ? Prisma.sql` AND f.amc_code = ${filters.amcCode}` : Prisma.empty}${
      filters?.assetClass ? Prisma.sql` AND f.asset_class = ${filters.assetClass}` : Prisma.empty
    }${arnScope ? Prisma.sql` AND f.arn_profile_id = ANY(${arnScope}::uuid[])` : Prisma.empty}`;
    const joinType = filters?.amcCode || filters?.assetClass || arnScope ? Prisma.sql`JOIN` : Prisma.sql`LEFT JOIN`;

    // merged_into_client_id IS NULL — merged-away clients (see mergeClients)
    // are excluded from the default roster; their history lives on under
    // the surviving client's id instead.
    const clients = await prisma.$queryRaw<Array<Omit<ClientListRow, "totalInvested">>>`
      SELECT c.id, c.name, c.pan_number AS "panNumber", c.email, c.phone, c.created_at AS "createdAt",
             c.needs_review AS "needsReview",
             COUNT(f.id)::int AS "folioCount",
             COALESCE(SUM(COALESCE(f.valuation_amount, f.estimated_valuation_amount)), 0) AS "totalAum"
      FROM clients c
      ${joinType} folios f ON f.client_id = c.id ${holdingFilter}
      WHERE c.distributor_id = ${distributorId}::uuid AND c.merged_into_client_id IS NULL
      ${searchFilter}
      GROUP BY c.id
      ORDER BY "totalAum" DESC, c.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `;

    const [{ count: total }] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT c.id)::int AS count
      FROM clients c
      ${joinType} folios f ON f.client_id = c.id ${holdingFilter}
      WHERE c.distributor_id = ${distributorId}::uuid AND c.merged_into_client_id IS NULL
      ${searchFilter}
    `;

    // "Invested" (weighted-average cost basis of currently-held units, same
    // definition as ClientDetailPage's "Total Invested" tile via
    // computeFolioInvestedAmount) isn't a plain SQL SUM — a redemption
    // reduces cost proportionally, not just units — so it's computed here in
    // JS same as getClientDetail does, but only for this page's clients
    // (bounded by PAGE_SIZE), not the whole roster. The same transaction
    // fetch also feeds XIRR (Newton-Raphson over each PURCHASE/SWITCH_IN
    // as an outflow, REDEMPTION/SWITCH_OUT as an inflow, plus today's
    // totalAum as a final "as if sold today" inflow) — same definition as
    // ReportsService.getClientReturnsReport, just computed per-page here
    // instead of for the whole roster on every CRM list load.
    const pageClientIds = clients.map((c) => c.id);
    const foliosForInvested = pageClientIds.length
      ? await prisma.folio.findMany({
          where: {
            clientId: { in: pageClientIds },
            ...(filters?.amcCode ? { amcCode: filters.amcCode } : {}),
            ...(filters?.assetClass ? { assetClass: filters.assetClass } : {}),
            ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
          },
          select: {
            clientId: true,
            balanceUnits: true,
            transactions: { orderBy: [{ transactionDate: "asc" }, { id: "asc" }], select: { transactionType: true, transactionDate: true, amount: true, units: true, isRejection: true } },
          },
        })
      : [];
    const investedByClient = new Map<string, number>();
    const cashFlowsByClient = new Map<string, Array<{ date: Date; amount: number }>>();
    for (const f of foliosForInvested) {
      const priorInvested = investedByClient.get(f.clientId) ?? 0;
      investedByClient.set(f.clientId, priorInvested + computeFolioInvestedAmount(f.transactions, f.balanceUnits ? Number(f.balanceUnits) : null));

      const cashFlows = cashFlowsByClient.get(f.clientId) ?? [];
      for (const t of f.transactions) {
        if (t.isRejection) continue;
        const amount = Number(t.amount ?? 0);
        if (amount === 0) continue;
        if (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN") {
          cashFlows.push({ date: t.transactionDate, amount: -amount });
        } else if (t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT") {
          cashFlows.push({ date: t.transactionDate, amount });
        }
      }
      cashFlowsByClient.set(f.clientId, cashFlows);
    }

    const clientsWithInvested: ClientListRow[] = clients.map((c) => {
      const totalInvested = investedByClient.get(c.id) ?? 0;
      const totalAum = Number(c.totalAum);
      const gain = totalAum - totalInvested;

      const rawCashFlows = cashFlowsByClient.get(c.id) ?? [];
      const cashFlows = [...rawCashFlows];
      if (totalAum > 0) cashFlows.push({ date: new Date(), amount: totalAum });
      const xirr = cashFlows.length >= 2 ? computeXirr(cashFlows) : null;

      // Earliest real cash flow across every folio — NOT rawCashFlows[0],
      // which is only the first folio's own first transaction in whatever
      // order Prisma returned folios, not necessarily this client's
      // globally-earliest purchase.
      const firstInvestmentDate = rawCashFlows.length
        ? new Date(Math.min(...rawCashFlows.map((cf) => cf.date.getTime())))
        : null;
      const cagr = firstInvestmentDate ? computeCagr(totalInvested, totalAum, firstInvestmentDate) : null;

      return {
        ...c,
        totalInvested: totalInvested.toFixed(2),
        gain: gain.toFixed(2),
        absoluteReturnPercent: totalInvested > 0.01 ? ((gain / totalInvested) * 100).toFixed(2) : null,
        xirr: xirr !== null ? (xirr * 100).toFixed(2) : null,
        cagr: cagr !== null ? (cagr * 100).toFixed(2) : null,
      };
    });

    return { total, page, pageSize: PAGE_SIZE, clients: clientsWithInvested };
  }

  async getClientDetail(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({
      where: { id: clientId, distributorId },
      include: {
        family: { select: { id: true, familyName: true, headClientId: true } },
        folios: {
          orderBy: { valuationAmount: "desc" },
          include: {
            sipRegistrations: { orderBy: { registrationDate: "desc" } },
            // Ascending order matters here — computeFolioInvestedAmount
            // walks transactions chronologically to build a running
            // weighted-average cost basis, not just summing amounts. The `id`
            // tiebreaker is required, not cosmetic: real folios can carry
            // hundreds of transactions sharing the exact same transactionDate
            // (confirmed 2026-08-10 — a mass RTA reissue/reversal batch, seen
            // platform-wide), and transactionDate alone left Postgres free to
            // return those tied rows in a different order on different query
            // plans, making the same folio's computed "Invested" swing
            // between calls (one real case: ₹1.99 crore on one query plan,
            // ₹98.8 BILLION on another, same underlying rows).
            transactions: {
              orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
              select: { transactionType: true, transactionDate: true, amount: true, units: true, isRejection: true, navPerUnit: true },
            },
            lastBalanceMailLog: { select: { subject: true, fromAddress: true, receivedAt: true, rtaType: true } },
          },
        },
        otherAssets: { orderBy: { asOfDate: "desc" } },
        nominees: { orderBy: { createdAt: "asc" } },
        bankAccounts: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const navByIsin = await fetchLatestNavByIsin(client.folios.map((f) => f.isin));

    const mappedFolios = client.folios.map((f) => {
      // Persisted fallback for a folio that's never received an RTA
      // balance report (WBR4/CLIENT_AUM/MFSD203) at all — confirmed real
      // case: a client with a genuine lumpsum PURCHASE transaction (real
      // units, real amount) but every Folio-level balance field null,
      // because no balance report has arrived for that folio yet. Kept
      // fresh by crm-sync.ts's refreshEstimatedFolioBalance (called after
      // every new transaction on a folio still lacking a real balance
      // report) and backfilled once for pre-existing folios — read
      // directly here rather than recomputed per-request, so this always
      // matches what a raw-SQL AUM aggregate elsewhere in the app sees.
      const effectiveUnitsForLiveNav = f.balanceUnits ?? f.estimatedBalanceUnits;
      const liveValueResult = computeLiveValue(effectiveUnitsForLiveNav, navByIsin.get(f.isin ?? ""));
      const investedAmount = computeFolioInvestedAmount(f.transactions, f.balanceUnits ? Number(f.balanceUnits) : null);
      // Same three-way priority as the frontend's effectiveCurrentValue
      // (holdings-types.ts) — RTA-confirmed first, then live-NAV, then the
      // transaction-replay estimate — so the client-level gain/return/XIRR
      // below is computed from EXACTLY the number the summary tiles show,
      // not a different (narrower) one.
      const effectiveValue =
        f.valuationAmount !== null
          ? Number(f.valuationAmount)
          : liveValueResult.liveValue !== null
            ? Number(liveValueResult.liveValue)
            : Number(f.estimatedValuationAmount ?? 0);

      return {
        id: f.id,
        amcCode: f.amcCode,
        amcName: resolveDisplayAmcName(f.schemeName, f.amcCode, f.rtaType),
        folioNumber: f.folioNumber,
        schemeCode: f.schemeCode,
        schemeName: f.schemeName,
        assetClass: f.assetClass,
        balanceUnits: f.balanceUnits?.toString() ?? null,
        // RTA-reported snapshot — only as fresh as the last WBR4/MFSD203
        // balance report for this folio, which can lag by weeks. Null
        // (not estimated) when no such report has arrived yet — see
        // estimatedValuationAmount for the transaction-replay fallback.
        valuationAmount: f.valuationAmount?.toString() ?? null,
        investedAmount: investedAmount.toFixed(2),
        navPerUnit: f.navPerUnit?.toString() ?? null,
        balanceAsOfDate: f.balanceAsOfDate,
        // Independently computed from today's real AMFI NAV × the same
        // balanceUnits (falling back to the transaction-derived unit
        // count when there's no RTA balance yet) — null when this
        // scheme's ISIN hasn't been matched to a live NAV yet.
        ...liveValueResult,
        // Last-resort fallback, only populated when there's neither an
        // RTA balance snapshot nor a live AMFI NAV match — units replayed
        // from transaction history, valued at the most recent
        // transaction's own NAV.
        estimatedBalanceUnits: f.estimatedBalanceUnits?.toString() ?? null,
        estimatedValuationAmount: f.estimatedValuationAmount?.toString() ?? null,
        activeSips: f.sipRegistrations.filter((s) => s.isActive).length,
        // Distinct active registration types on this folio (SIP/STP/SWP,
        // real WBR49/MFSD243 data — see mapSipRegistrationRecord) — a folio
        // can genuinely carry more than one (e.g. a SIP feeding it AND an
        // SWP draining it), so this is a set, not a single label. Empty
        // when the folio has active registrations from before
        // registrationType existed, or none at all.
        activeRegistrationTypes: Array.from(
          new Set(f.sipRegistrations.filter((s) => s.isActive && s.registrationType).map((s) => s.registrationType as string)),
        ),
        source: f.source,
        transactionCount: f.transactions.length,
        // Which real mail/file the CURRENT balance snapshot came from —
        // null for CAS-imported folios and for balances last touched before
        // this field existed.
        balanceSourceMail: f.lastBalanceMailLog
          ? {
              subject: f.lastBalanceMailLog.subject,
              fromAddress: f.lastBalanceMailLog.fromAddress,
              receivedAt: f.lastBalanceMailLog.receivedAt,
              rtaType: f.lastBalanceMailLog.rtaType,
            }
          : null,
        // Internal-only (stripped below) — feeds the client-level gain/XIRR summary.
        _effectiveValue: effectiveValue,
        _cashFlows: f.transactions
          .filter((t) => !t.isRejection && Number(t.amount ?? 0) !== 0 && (t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" || t.transactionType === "REDEMPTION" || t.transactionType === "SWITCH_OUT"))
          .map((t) => ({
            date: t.transactionDate,
            amount: t.transactionType === "PURCHASE" || t.transactionType === "SWITCH_IN" ? -Number(t.amount) : Number(t.amount),
          })),
      };
    });

    const totalCurrentValue = mappedFolios.reduce((sum, f) => sum + f._effectiveValue, 0);
    const totalInvestedValue = mappedFolios.reduce((sum, f) => sum + Number(f.investedAmount), 0);
    const gain = totalCurrentValue - totalInvestedValue;
    const rawClientCashFlows = mappedFolios.flatMap((f) => f._cashFlows);
    const clientCashFlows = [...rawClientCashFlows];
    if (totalCurrentValue > 0) clientCashFlows.push({ date: new Date(), amount: totalCurrentValue });
    const xirr = clientCashFlows.length >= 2 ? computeXirr(clientCashFlows) : null;
    const firstInvestmentDate = rawClientCashFlows.length
      ? new Date(Math.min(...rawClientCashFlows.map((cf) => cf.date.getTime())))
      : null;
    const cagr = firstInvestmentDate ? computeCagr(totalInvestedValue, totalCurrentValue, firstInvestmentDate) : null;
    const folios = mappedFolios.map(({ _effectiveValue, _cashFlows, ...f }) => f);

    return {
      id: client.id,
      totalCurrentValue: totalCurrentValue.toFixed(2),
      totalInvestedValue: totalInvestedValue.toFixed(2),
      gain: gain.toFixed(2),
      absoluteReturnPercent: totalInvestedValue > 0.01 ? ((gain / totalInvestedValue) * 100).toFixed(2) : null,
      xirr: xirr !== null ? (xirr * 100).toFixed(2) : null,
      cagr: cagr !== null ? (cagr * 100).toFixed(2) : null,
      name: client.name,
      panNumber: client.panNumber,
      email: client.email,
      phone: client.phone,
      dateOfBirth: client.dateOfBirth,
      kycStatus: client.kycStatus,
      familyId: client.familyId,
      familyName: client.family?.familyName ?? null,
      isFamilyHead: client.family?.headClientId === client.id,
      // Client master fields captured from the RTA's investor-master report
      // (CAMS WBR9 / KFintech MFSD211) — real data, previously parsed but
      // never persisted (see [[mfd_ingestion_engine]]).
      address1: client.address1,
      address2: client.address2,
      city: client.city,
      pincode: client.pincode,
      taxStatus: client.taxStatus,
      bankAccountNumber: client.bankAccountNumber,
      bankName: client.bankName,
      // Real bug found on real data (2026-08-10): the same real bank account
      // gets one ClientBankAccount row PER FOLIO it's reported against (the
      // RTA's own MFSD263/bank-details report lists a client's bank account
      // once per folio subscription, and idempotencyHash is folio-scoped for
      // audit traceability — see upsertClientBankAccountFromRta) — a client
      // with many folios sharing one real bank account ends up with that
      // many identical-looking rows here. Dedupe by the account's real
      // identity (bank + account number + IFSC) for display; orderBy
      // createdAt asc above means Array.filter's "first occurrence wins"
      // keeps the earliest-seen row.
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
      // RTA-fed since 2026-08-10 for CAMS (WBR9/WBR9C carry up to 3 nominees
      // inline per folio — see mapInvestorMasterNominees), still
      // MFD-entered ("MANUAL" source) for anything without a matching RTA
      // report yet. Same per-folio duplication risk as bankAccounts above
      // (one real nominee reported once per folio), but confirmed against
      // real data (2026-08-10) that two rows for the same real nominee can
      // differ in casing and completeness (WBR9C: "SAVITA SINGH"/"WIFE";
      // WBR9's own basic feed for the same folio family: "Savita Singh"/
      // "Not Provided") — so this groups case-insensitively by name and
      // keeps whichever row actually has a real relation, not just the
      // first-seen one.
      nominees: dedupeNominees(client.nominees).map((n) => ({
          id: n.id,
          nomineeName: n.nomineeName,
          relation: n.relation,
          email: n.email,
          mobile: n.mobile,
          source: n.source,
        })),
      needsReview: client.needsReview,
      reviewReason: client.reviewReason,
      portalEnabled: client.portalEnabled,
      createdAt: client.createdAt,
      folios,
      otherAssets: client.otherAssets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
        description: a.description,
        value: a.value.toString(),
        asOfDate: a.asOfDate,
        details: a.details as Record<string, unknown> | null,
      })),
    };
  }

  private static readonly TRANSACTIONS_PAGE_SIZE = 20;

  /**
   * Paginated transaction history across every one of this client's
   * folios, newest first — pulled out of getClientDetail (which used to
   * embed a fixed "last 20" slice with no way to see older activity) so
   * the Recent Transactions card on the client detail page can page
   * through full history instead of being capped.
   */
  async getClientTransactions(clientId: string, page: number, search?: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

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
        skip: (page - 1) * CrmService.TRANSACTIONS_PAGE_SIZE,
        take: CrmService.TRANSACTIONS_PAGE_SIZE,
        include: {
          folio: { select: { schemeName: true, folioNumber: true, amcCode: true, schemeCode: true } },
          mailLog: { select: { subject: true, fromAddress: true, receivedAt: true, rtaType: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize: CrmService.TRANSACTIONS_PAGE_SIZE,
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
        brokerageAmount: t.brokerageAmount?.toString() ?? null,
        isRejection: t.isRejection,
        rejectionReason: t.rejectionReason,
        source: t.source,
        sourceMail: t.mailLog
          ? { subject: t.mailLog.subject, fromAddress: t.mailLog.fromAddress, receivedAt: t.mailLog.receivedAt, rtaType: t.mailLog.rtaType }
          : null,
      })),
    };
  }

  /**
   * Full date-wise transaction history for one folio — deliberately a
   * separate lazy-loaded call rather than embedded in getClientDetail
   * (which only returns the last 20 across all folios): a single folio can
   * carry years of SIP installments, and the CRM/client-portal holdings
   * view only needs this when a folio row is expanded.
   *
   * Real bug reported 2026-08-12 ("in many clients... few transactions are
   * showing repeat entry", especially in SIP/STP/SWP history): the same
   * mass-reissue duplicate rows that corrupted computeFolioInvestedAmount
   * (see cost-basis.ts's doc comment) are still real rows in the
   * transactions table, so this endpoint was showing them as confusing
   * duplicate-looking entries. Fetched ascending (required — see
   * findRepeatedTransactionIndexes's own doc comment on why "earliest
   * wins" needs ascending order) so the genuine, earliest-dated row of each
   * duplicate group is the one kept, then reversed back to the newest-first
   * order this endpoint has always returned.
   */
  async getFolioTransactions(clientId: string, folioId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const folio = await prisma.folio.findFirst({ where: { id: folioId, clientId, distributorId } });
    if (!folio) {
      throw new NotFoundException("Folio not found");
    }
    const transactions = await prisma.transaction.findMany({
      where: { folioId },
      orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
      include: { mailLog: { select: { subject: true, fromAddress: true, receivedAt: true, rtaType: true } } },
    });
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
        rejectionReason: t.rejectionReason,
        source: t.source,
        sourceMail: t.mailLog
          ? { subject: t.mailLog.subject, fromAddress: t.mailLog.fromAddress, receivedAt: t.mailLog.receivedAt, rtaType: t.mailLog.rtaType }
          : null,
      }));
  }

  /**
   * Every SIP/STP registration this client holds (active and ceased),
   * with an estimated next-due-date so the MFD/client can see this month's
   * upcoming installments without cross-referencing the distributor-wide
   * SIP Due report. Same frequency/due-date math as reports.service.ts's
   * SIP Due report (via sip-frequency.ts) — one source of truth, not two
   * copies. SIP/STP/SWP all land in the same SipRegistration table (WBR49
   * and MFSD243 both report all three together) but are now distinguished
   * via registrationType (see sip-registration.ts) — null on rows synced
   * before that field existed, or where the RTA's own code wasn't
   * recognized, which the frontend buckets as "unclassified" rather than
   * guessing.
   */
  async getClientSystematicInvestments(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    const registrations = await prisma.sipRegistration.findMany({
      where: { distributorId, folio: { clientId } },
      orderBy: [{ isActive: "desc" }, { registrationDate: "desc" }],
      include: { folio: { select: { folioNumber: true, amcCode: true, schemeName: true, schemeCode: true } } },
    });

    // Folio.schemeName is only populated once an AUM/balance report has
    // enriched that folio — a SIP-only folio (registered but never balance-
    // reported yet) has it null, which used to fall straight back to the
    // SipRegistration's own bare scheme code (e.g. "EDWRG" instead of "ICICI
    // Prudential Balanced Advantage Fund - Growth"). SchemeMaster is the
    // global AMFI-wide catalog (WBR39), keyed on (amcCode, schemeCode) same
    // as here, so it's a real fallback before giving up to the raw code.
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

  /** A client can have more than one nominee (real SEBI nomination rules allow up to 3 per folio) — this always adds a new row, never overwrites an existing one. Manual-entry only today; crm-sync.ts never touches this table. */
  async addNominee(clientId: string, data: { nomineeName: string; relation?: string; email?: string; mobile?: string }) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    return prisma.clientNominee.create({
      data: {
        distributorId,
        clientId,
        nomineeName: data.nomineeName,
        relation: data.relation || null,
        email: data.email || null,
        mobile: data.mobile || null,
      },
    });
  }

  async removeNominee(clientId: string, nomineeId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const nominee = await prisma.clientNominee.findFirst({ where: { id: nomineeId, clientId, distributorId } });
    if (!nominee) {
      throw new NotFoundException("Nominee not found");
    }
    await prisma.clientNominee.delete({ where: { id: nomineeId } });
    return { status: "ok" };
  }

  /** Additional bank account beyond the single RTA-sourced primary one on Client.bankAccountNumber/bankName — see ClientBankAccount's schema doc comment. Manual-entry only today. */
  async addBankAccount(clientId: string, data: { bankName: string; accountNumber: string; ifscCode?: string; branchName?: string }) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    return prisma.clientBankAccount.create({
      data: {
        distributorId,
        clientId,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        ifscCode: data.ifscCode || null,
        branchName: data.branchName || null,
      },
    });
  }

  async removeBankAccount(clientId: string, bankAccountId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const bankAccount = await prisma.clientBankAccount.findFirst({ where: { id: bankAccountId, clientId, distributorId } });
    if (!bankAccount) {
      throw new NotFoundException("Bank account not found");
    }
    await prisma.clientBankAccount.delete({ where: { id: bankAccountId } });
    return { status: "ok" };
  }

  /**
   * Merges sourceClientId into targetClientId: reassigns every folio and
   * other-asset to the target (transactions/SIP registrations follow
   * automatically since they key off folioId, not clientId directly), then
   * marks the source as merged rather than deleting it — preserves the
   * historical trail (RtaInsightLedger rows, audit logs) which may still
   * reference the old client id indirectly. Merged-away clients are
   * excluded from listClients() by default.
   */
  async mergeClients(sourceClientId: string, targetClientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    if (sourceClientId === targetClientId) {
      throw new ConflictException("Cannot merge a client into itself");
    }
    const [source, target] = await Promise.all([
      prisma.client.findFirst({ where: { id: sourceClientId, distributorId } }),
      prisma.client.findFirst({ where: { id: targetClientId, distributorId } }),
    ]);
    if (!source || !target) {
      throw new NotFoundException("Client not found");
    }
    if (source.mergedIntoClientId) {
      throw new ConflictException("Source client has already been merged");
    }

    await prisma.$transaction([
      prisma.folio.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
      prisma.otherAsset.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
      prisma.client.update({ where: { id: sourceClientId }, data: { mergedIntoClientId: targetClientId } }),
    ]);

    return { sourceClientId, targetClientId, mergedAt: new Date() };
  }

  async listFamilies() {
    const distributorId = TenantContext.currentDistributorId();
    const families = await prisma.family.findMany({
      where: { distributorId },
      orderBy: { createdAt: "desc" },
      include: { clients: { select: { id: true, name: true } } },
    });
    return families.map((f) => ({
      id: f.id,
      familyName: f.familyName,
      headClientId: f.headClientId,
      members: f.clients,
    }));
  }

  /**
   * Single-shot family creation matching the actual UX flow: pick a head
   * from a searchable client list first, then pick members (also
   * searchable, head excluded from that second list) from the remaining
   * clients, then create — rather than the old flatter flow of naming a
   * family, adding members one at a time, and setting the head as a
   * separate afterthought step.
   */
  async createFamilyWithMembers(familyName: string, headClientId: string, memberClientIds: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const allClientIds = Array.from(new Set([headClientId, ...memberClientIds]));
    const owned = await prisma.client.findMany({ where: { id: { in: allClientIds }, distributorId }, select: { id: true } });
    if (owned.length !== allClientIds.length) {
      throw new NotFoundException("One or more selected clients were not found");
    }

    const family = await prisma.family.create({ data: { distributorId, familyName } });
    await prisma.client.updateMany({ where: { id: { in: allClientIds } }, data: { familyId: family.id } });
    return prisma.family.update({ where: { id: family.id }, data: { headClientId } });
  }

  async updateFamilyName(familyId: string, familyName: string) {
    await this.assertFamilyOwnership(familyId);
    return prisma.family.update({ where: { id: familyId }, data: { familyName } });
  }

  /** Detaches every member first (their Client rows survive untouched, just familyId cleared) then deletes the Family row itself. */
  async removeFamily(familyId: string) {
    await this.assertFamilyOwnership(familyId);
    await prisma.client.updateMany({ where: { familyId }, data: { familyId: null } });
    await prisma.family.delete({ where: { id: familyId } });
    return { status: "ok" };
  }

  private async assertFamilyOwnership(familyId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const family = await prisma.family.findFirst({ where: { id: familyId, distributorId } });
    if (!family) {
      throw new NotFoundException("Family not found");
    }
    return family;
  }

  async addFamilyMember(familyId: string, clientId: string) {
    await this.assertFamilyOwnership(familyId);
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    return prisma.client.update({ where: { id: clientId }, data: { familyId } });
  }

  async removeFamilyMember(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    // A departing head can't leave a stale headClientId pointing at a
    // client no longer in the family.
    if (client.familyId) {
      await prisma.family.updateMany({ where: { id: client.familyId, headClientId: clientId }, data: { headClientId: null } });
    }
    return prisma.client.update({ where: { id: clientId }, data: { familyId: null } });
  }

  async setFamilyHead(familyId: string, clientId: string) {
    const family = await this.assertFamilyOwnership(familyId);
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId, familyId } });
    if (!client) {
      throw new NotFoundException("Client must already be a member of this family");
    }
    return prisma.family.update({ where: { id: family.id }, data: { headClientId: clientId } });
  }

  /**
   * Turns on the client-portal login for one client — the login id is the
   * client's PAN (not email, per 2026-07-23 design: PAN is the canonical
   * investor identifier here), so a PAN must be on file first. An email is
   * still used to deliver the credentials if present — if it's missing,
   * onboarding still succeeds and the MFD just relays the password
   * manually (same fallback pattern as MFD onboarding's welcome email).
   * Fixed default password, forces a change on first login. Enforces
   * uniqueness among portalEnabled=true clients at write time
   * (Client.panNumber is only unique per-distributor at the DB level), so
   * two clients — even across different MFDs — can never collide on login
   * PAN once both have a live portal login.
   */
  async createPortalLogin(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    if (!client.panNumber) {
      throw new ConflictException("Client has no PAN on file — add one before creating a portal login");
    }
    const panNumber = client.panNumber.toUpperCase();
    const existing = await prisma.client.findFirst({ where: { panNumber, portalEnabled: true, id: { not: clientId } } });
    if (existing) {
      throw new ConflictException("Another client already has a portal login with this PAN");
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PORTAL_PASSWORD, BCRYPT_ROUNDS);
    await prisma.client.update({
      where: { id: clientId },
      data: { passwordHash, portalEnabled: true, mustChangePassword: true },
    });

    const emailResult = client.email
      ? await sendPortalLoginEmail({
          toEmail: client.email,
          clientName: client.name,
          loginEmail: panNumber,
          initialPassword: DEFAULT_PORTAL_PASSWORD,
        })
      : { sent: false, error: "No email on file to send credentials to — relay them manually" };

    return {
      loginId: panNumber,
      initialPassword: DEFAULT_PORTAL_PASSWORD,
      welcomeEmailSent: emailResult.sent,
      welcomeEmailError: emailResult.error,
    };
  }

  /** Clears the flag CAS import sets on an auto-created client (see importCas) once the admin has filled in its details. */
  async markReviewed(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    return prisma.client.update({
      where: { id: clientId },
      data: { needsReview: false, reviewReason: null },
      select: { id: true, needsReview: true },
    });
  }

  async disablePortalLogin(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    await prisma.client.update({ where: { id: clientId }, data: { portalEnabled: false } });
    return { status: "ok" };
  }

  /**
   * Resets an already-enabled portal login back to the fixed default
   * password — unlike createPortalLogin (which forces a change-password
   * prompt on first login), a reset does NOT force one: per explicit
   * design (2026-07-23), the client can keep using the default or change
   * it, their choice, matching AdminService.resetPassword's same
   * "MFD reset" convention.
   */
  async resetClientPortalPassword(clientId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const client = await prisma.client.findFirst({ where: { id: clientId, distributorId } });
    if (!client) {
      throw new NotFoundException("Client not found");
    }
    if (!client.portalEnabled) {
      throw new ConflictException("This client doesn't have a portal login enabled");
    }
    const passwordHash = await bcrypt.hash(DEFAULT_PORTAL_PASSWORD, BCRYPT_ROUNDS);
    await prisma.client.update({ where: { id: clientId }, data: { passwordHash, mustChangePassword: false } });
    return { loginId: client.panNumber, newPassword: DEFAULT_PORTAL_PASSWORD };
  }
}
