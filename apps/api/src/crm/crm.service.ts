import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Prisma, prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";
import { computeFolioInvestedAmount } from "../reports/cost-basis";
import { resolveDisplayAmcName } from "../reports/amc-display-name";
import { sendPortalLoginEmail } from "./portal-login-email";

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
    const clients = await prisma.$queryRaw<ClientListRow[]>`
      SELECT c.id, c.name, c.pan_number AS "panNumber", c.email, c.phone, c.created_at AS "createdAt",
             c.needs_review AS "needsReview",
             COUNT(f.id)::int AS "folioCount",
             COALESCE(SUM(f.valuation_amount), 0) AS "totalAum"
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

    return { total, page, pageSize: PAGE_SIZE, clients };
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
            // weighted-average cost basis, not just summing amounts.
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
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    return {
      id: client.id,
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
      bankAccounts: client.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        ifscCode: b.ifscCode,
        branchName: b.branchName,
        source: b.source,
      })),
      // Manually maintained today — the RTA feed doesn't carry nominee data
      // at all yet, an RTA-fed feed is expected in future (see
      // [[mfd_ingestion_engine]]), hence the `source` flag already being
      // carried through even though every row is "MANUAL" right now.
      nominees: client.nominees.map((n) => ({
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
      folios: client.folios.map((f) => ({
        id: f.id,
        amcCode: f.amcCode,
        amcName: resolveDisplayAmcName(f.schemeName, f.amcCode, f.rtaType),
        folioNumber: f.folioNumber,
        schemeCode: f.schemeCode,
        schemeName: f.schemeName,
        assetClass: f.assetClass,
        balanceUnits: f.balanceUnits?.toString() ?? null,
        valuationAmount: f.valuationAmount?.toString() ?? null,
        investedAmount: computeFolioInvestedAmount(f.transactions).toFixed(2),
        navPerUnit: f.navPerUnit?.toString() ?? null,
        balanceAsOfDate: f.balanceAsOfDate,
        activeSips: f.sipRegistrations.filter((s) => s.isActive).length,
        source: f.source,
        transactionCount: f.transactions.length,
      })),
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
        include: { folio: { select: { schemeName: true, folioNumber: true, amcCode: true, schemeCode: true } } },
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
        source: t.source,
      })),
    };
  }

  /**
   * Full date-wise transaction history for one folio — deliberately a
   * separate lazy-loaded call rather than embedded in getClientDetail
   * (which only returns the last 20 across all folios): a single folio can
   * carry years of SIP installments, and the CRM/client-portal holdings
   * view only needs this when a folio row is expanded.
   */
  async getFolioTransactions(clientId: string, folioId: string) {
    const distributorId = TenantContext.currentDistributorId();
    const folio = await prisma.folio.findFirst({ where: { id: folioId, clientId, distributorId } });
    if (!folio) {
      throw new NotFoundException("Folio not found");
    }
    const transactions = await prisma.transaction.findMany({
      where: { folioId },
      orderBy: { transactionDate: "desc" },
    });
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
