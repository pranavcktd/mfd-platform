import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

const PAGE_SIZE = 25;

export type MisCheck =
  | "no-nominee"
  | "no-investment"
  | "no-sip"
  | "zero-balance"
  | "no-pan"
  | "needs-review"
  | "kyc-failed"
  | "aadhaar-not-linked";

@Injectable()
export class MisService {
  /** Lightweight counts for all 6 checks at once — powers the tab badges without paginating every table just to show a number. */
  async getCounts(requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(distributorId, requestedArnProfileIds);

    const [noNominee, noInvestment, noSip, zeroBalance, noPan, needsReview, kycFailed, aadhaarNotLinked] = await Promise.all([
      prisma.client.count({ where: this.clientWhere(distributorId, arnScope, { mergedIntoClientId: null, nominees: { none: {} } }) }),
      prisma.client.count({ where: this.clientWhere(distributorId, arnScope, { folios: { none: {} } }) }),
      prisma.client.count({
        where: this.clientWhere(distributorId, arnScope, {
          AND: [
            { folios: { some: arnScope ? { arnProfileId: { in: arnScope } } : {} } },
            { folios: { every: { sipRegistrations: { none: { isActive: true } } } } },
          ],
        }),
      }),
      prisma.folio.count({ where: this.folioWhere(distributorId, arnScope, { OR: [{ valuationAmount: null }, { valuationAmount: 0 }] }) }),
      prisma.folio.count({ where: this.folioWhere(distributorId, arnScope, { client: { panNumber: null } }) }),
      prisma.client.count({ where: this.clientWhere(distributorId, arnScope, { needsReview: true }) }),
      prisma.folio.count({ where: this.folioWhere(distributorId, arnScope, this.kycFailedFilter()) }),
      prisma.folio.count({ where: this.folioWhere(distributorId, arnScope, this.aadhaarNotLinkedFilter()) }),
    ]);

    return {
      "no-nominee": noNominee,
      "no-investment": noInvestment,
      "no-sip": noSip,
      "zero-balance": zeroBalance,
      "no-pan": noPan,
      "needs-review": needsReview,
      "kyc-failed": kycFailed,
      "aadhaar-not-linked": aadhaarNotLinked,
    };
  }

  /** From CAMS WBR56 ("KYC status of Investor") — any reported status other than "KYC OK" is flagged, not just the literal "KYC Failed" string, since real data may carry other non-OK statuses this app hasn't seen a sample of yet. */
  private kycFailedFilter() {
    return { kycStatus: { not: null, notIn: ["KYC OK"] } };
  }

  /**
   * Only flags folios WBR56 has actually reported on (kycStatus present) —
   * a folio with no KYC report at all yet isn't a known problem, just
   * missing data. aadhaarStatus can be genuinely null (real data: CAMS
   * leaves it blank rather than sending an explicit "not linked" string) —
   * SQL's `NOT IN` never matches a NULL, so that case needs its own OR arm
   * rather than relying on notIn alone.
   */
  private aadhaarNotLinkedFilter() {
    return {
      kycStatus: { not: null },
      OR: [{ aadhaarStatus: null }, { aadhaarStatus: { notIn: ["Aadhar Linked"] } }],
    };
  }

  /**
   * One paginated check at a time — matches MisPage.tsx's tab UI, which
   * only ever shows one table at a time, so there's no need to compute or
   * transfer all 6 lists on every load like the old combined getSummary()
   * did. ARN-scoping a client-level check (no-nominee, no-investment,
   * needs-review) means "has at least one folio under this ARN" — a client
   * with zero folios (no-investment by definition) or an external
   * CAS-only client (needs-review) will correctly disappear entirely once
   * a specific ARN is selected, same as everywhere else in the app: those
   * clients aren't attributed to any of your ARNs.
   */
  async getCheck(check: MisCheck, page: number, search?: string, requestedArnProfileIds?: string[]) {
    const distributorId = TenantContext.currentDistributorId();
    const arnScope = await this.resolveArnScope(distributorId, requestedArnProfileIds);
    const searchFilter = search
      ? { OR: [{ name: { contains: search, mode: Prisma.QueryMode.insensitive } }, { panNumber: { contains: search, mode: Prisma.QueryMode.insensitive } }] }
      : {};

    switch (check) {
      case "no-nominee":
        return this.paginateClients(this.clientWhere(distributorId, arnScope, { mergedIntoClientId: null, nominees: { none: {} }, ...searchFilter }), page);
      case "no-investment":
        return this.paginateClients(this.clientWhere(distributorId, arnScope, { folios: { none: {} }, ...searchFilter }), page);
      case "no-sip":
        return this.paginateClients(
          this.clientWhere(distributorId, arnScope, {
            AND: [
              { folios: { some: arnScope ? { arnProfileId: { in: arnScope } } : {} } },
              { folios: { every: { sipRegistrations: { none: { isActive: true } } } } },
            ],
            ...searchFilter,
          }),
          page,
        );
      case "needs-review":
        return this.paginateClients(this.clientWhere(distributorId, arnScope, { needsReview: true, ...searchFilter }), page, true);
      case "zero-balance":
        return this.paginateFolios(
          this.folioWhere(distributorId, arnScope, {
            OR: [{ valuationAmount: null }, { valuationAmount: 0 }],
            ...(search ? { client: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } : {}),
          }),
          page,
          "balanceAsOfDate",
        );
      case "no-pan":
        return this.paginateFolios(
          this.folioWhere(distributorId, arnScope, {
            client: { panNumber: null, ...(search ? { name: { contains: search, mode: Prisma.QueryMode.insensitive } } : {}) },
          }),
          page,
          "createdAt",
        );
      case "kyc-failed":
        return this.paginateFolios(
          this.folioWhere(distributorId, arnScope, {
            ...this.kycFailedFilter(),
            ...(search ? { client: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } : {}),
          }),
          page,
          "kycReportDate",
        );
      case "aadhaar-not-linked":
        return this.paginateFolios(
          this.folioWhere(distributorId, arnScope, {
            ...this.aadhaarNotLinkedFilter(),
            ...(search ? { client: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } : {}),
          }),
          page,
          "kycReportDate",
        );
    }
  }

  private async resolveArnScope(distributorId: string, requestedArnProfileIds?: string[]): Promise<string[] | undefined> {
    if (!requestedArnProfileIds || requestedArnProfileIds.length === 0) {
      return undefined;
    }
    const owned = await prisma.arnProfile.findMany({ where: { distributorId, id: { in: requestedArnProfileIds } }, select: { id: true } });
    return owned.map((a) => a.id);
  }

  private clientWhere(distributorId: string, arnScope: string[] | undefined, extra: Record<string, unknown>) {
    return {
      distributorId,
      ...(arnScope ? { folios: { some: { arnProfileId: { in: arnScope } } } } : {}),
      ...extra,
    };
  }

  private folioWhere(distributorId: string, arnScope: string[] | undefined, extra: Record<string, unknown>) {
    return {
      distributorId,
      ...(arnScope ? { arnProfileId: { in: arnScope } } : {}),
      ...extra,
    };
  }

  private async paginateClients(where: Prisma.ClientWhereInput, page: number, withReviewReason = false) {
    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: { id: true, name: true, panNumber: true, createdAt: true, reviewReason: withReviewReason },
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      rows: clients.map((c) => ({
        id: c.id,
        name: c.name,
        panNumber: c.panNumber,
        createdAt: c.createdAt,
        reviewReason: withReviewReason ? (c as { reviewReason: string | null }).reviewReason : undefined,
      })),
    };
  }

  private async paginateFolios(
    where: Prisma.FolioWhereInput,
    page: number,
    orderField: "balanceAsOfDate" | "createdAt" | "kycReportDate",
  ) {
    const [total, folios] = await Promise.all([
      prisma.folio.count({ where }),
      prisma.folio.findMany({
        where,
        orderBy: { [orderField]: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          folioNumber: true,
          amcCode: true,
          schemeCode: true,
          valuationAmount: true,
          balanceAsOfDate: true,
          kycStatus: true,
          kycStatusDescription: true,
          aadhaarStatus: true,
          kycReportDate: true,
          client: { select: { id: true, name: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      rows: folios.map((f) => ({
        id: f.id,
        clientId: f.client.id,
        clientName: f.client.name,
        folioNumber: f.folioNumber,
        amcCode: f.amcCode,
        schemeCode: f.schemeCode,
        balanceAsOfDate: f.balanceAsOfDate,
        kycStatus: f.kycStatus,
        kycStatusDescription: f.kycStatusDescription,
        aadhaarStatus: f.aadhaarStatus,
        kycReportDate: f.kycReportDate,
      })),
    };
  }
}
