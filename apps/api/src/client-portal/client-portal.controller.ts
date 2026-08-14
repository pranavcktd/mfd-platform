import { Controller, Get, Param, Query } from "@nestjs/common";
import { ClientPortalService } from "./client-portal.service";

@Controller("client")
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Get("me")
  getMe() {
    return this.clientPortalService.getMe();
  }

  @Get("transactions")
  getMyTransactions(@Query("page") page?: string, @Query("search") search?: string) {
    return this.clientPortalService.getMyTransactions(page ? Number(page) : 1, search);
  }

  @Get("systematic-investments")
  getMySystematicInvestments() {
    return this.clientPortalService.getMySystematicInvestments();
  }

  @Get("transaction-date-range")
  getMyTransactionDateRange() {
    return this.clientPortalService.getMyTransactionDateRange();
  }

  @Get("capital-gains")
  getMyCapitalGains(
    @Query("type") type?: "realized" | "notional",
    @Query("fyStartDate") fyStartDate?: string,
    @Query("fyEndDate") fyEndDate?: string,
  ) {
    return this.clientPortalService.getMyCapitalGains(
      type === "realized",
      fyStartDate ? new Date(fyStartDate) : undefined,
      fyEndDate ? new Date(fyEndDate) : undefined,
    );
  }

  @Get("capital-gains/detail")
  getMyCapitalGainsDetail(
    @Query("type") type?: "realized" | "notional",
    @Query("fyStartDate") fyStartDate?: string,
    @Query("fyEndDate") fyEndDate?: string,
  ) {
    return this.clientPortalService.getMyCapitalGainsDetail(
      type === "realized",
      fyStartDate ? new Date(fyStartDate) : undefined,
      fyEndDate ? new Date(fyEndDate) : undefined,
    );
  }

  @Get("family/:memberId")
  getFamilyMember(@Param("memberId") memberId: string) {
    return this.clientPortalService.getFamilyMemberDetail(memberId);
  }

  @Get("folios/:folioId/transactions")
  getFolioTransactions(@Param("folioId") folioId: string) {
    return this.clientPortalService.getFolioTransactions(folioId);
  }

  @Get("family/:memberId/folios/:folioId/transactions")
  getFamilyMemberFolioTransactions(@Param("memberId") memberId: string, @Param("folioId") folioId: string) {
    return this.clientPortalService.getFamilyMemberFolioTransactions(memberId, folioId);
  }
}
