import { Controller, Get, Param, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";

function parseArnIds(raw?: string): string[] | undefined {
  return raw ? raw.split(",").filter(Boolean) : undefined;
}

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("aum")
  getAum(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getAumReport(parseArnIds(arnProfileIds));
  }

  @Get("transactions")
  getTransactions(
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.reportsService.getTransactionsReport({
      type,
      from,
      to,
      page: page ? Number(page) : 1,
      arnProfileIds: parseArnIds(arnProfileIds),
    });
  }

  @Get("sip")
  getSip(
    @Query("status") status?: "new" | "active" | "ceased",
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.reportsService.getSipReport(status, page ? Number(page) : 1, parseArnIds(arnProfileIds));
  }

  @Get("holdings")
  getHoldings(
    @Query("clientId") clientId?: string,
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("search") search?: string,
  ) {
    return this.reportsService.getHoldingsReport(clientId, page ? Number(page) : 1, parseArnIds(arnProfileIds), search);
  }

  @Get("net-worth")
  getNetWorth(
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("search") search?: string,
  ) {
    return this.reportsService.getNetWorthReport(page ? Number(page) : 1, parseArnIds(arnProfileIds), search);
  }

  @Get("valuation")
  getValuation(
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("search") search?: string,
  ) {
    return this.reportsService.getValuationReport(page ? Number(page) : 1, parseArnIds(arnProfileIds), search);
  }

  @Get("brokerage/summary")
  getBrokerageSummary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("amcCode") amcCode?: string,
    @Query("clientId") clientId?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.reportsService.getBrokerageSummary({ from, to, amcCode, clientId, arnProfileIds: parseArnIds(arnProfileIds) });
  }

  @Get("brokerage/transactions")
  getBrokerageTransactions(
    @Query("page") page?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("amcCode") amcCode?: string,
    @Query("clientId") clientId?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
  ) {
    return this.reportsService.getBrokerageTransactions(page ? Number(page) : 1, {
      from,
      to,
      amcCode,
      clientId,
      arnProfileIds: parseArnIds(arnProfileIds),
    });
  }

  // --- Client reports ---

  @Get("client/family-allocation")
  getFamilyAllocation(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getFamilyAllocationReport(parseArnIds(arnProfileIds));
  }

  @Get("client/cas")
  getCasReport(@Query("page") page?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getCasReport(page ? Number(page) : 1, parseArnIds(arnProfileIds));
  }

  @Get("client/capital-gains")
  getCapitalGains(
    @Query("type") type?: "realized" | "notional",
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("clientId") clientId?: string,
    @Query("fyStartDate") fyStartDate?: string,
    @Query("fyEndDate") fyEndDate?: string,
  ) {
    return this.reportsService.getCapitalGainsReport(
      type === "realized",
      parseArnIds(arnProfileIds),
      clientId,
      fyStartDate ? new Date(fyStartDate) : undefined,
      fyEndDate ? new Date(fyEndDate) : undefined,
    );
  }

  @Get("client/:clientId/transaction-date-range")
  getClientTransactionDateRange(@Param("clientId") clientId: string) {
    return this.reportsService.getClientTransactionDateRange(clientId);
  }

  @Get("client/capital-gains/detail")
  getCapitalGainsDetail(
    @Query("type") type?: "realized" | "notional",
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("clientId") clientId?: string,
    @Query("fyStartDate") fyStartDate?: string,
    @Query("fyEndDate") fyEndDate?: string,
  ) {
    return this.reportsService.getCapitalGainsDetailReport(
      type === "realized",
      parseArnIds(arnProfileIds),
      clientId,
      fyStartDate ? new Date(fyStartDate) : undefined,
      fyEndDate ? new Date(fyEndDate) : undefined,
    );
  }

  // --- Distributor reports ---

  @Get("distributor/business-development")
  getBusinessDevelopment(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getBusinessDevelopmentReport(parseArnIds(arnProfileIds));
  }

  @Get("distributor/dividend")
  getDividend(@Query("page") page?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getDividendReport(page ? Number(page) : 1, parseArnIds(arnProfileIds));
  }

  @Get("distributor/sip-due")
  getSipDue(@Query("withinDays") withinDays?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getSipDueReport(withinDays ? Number(withinDays) : 7, parseArnIds(arnProfileIds));
  }

  @Get("distributor/sip-expiring")
  getSipExpiring(@Query("withinDays") withinDays?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getSipExpiringReport(withinDays ? Number(withinDays) : 30, parseArnIds(arnProfileIds));
  }

  @Get("distributor/brokerage-withheld")
  getBrokerageWithheld(
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("search") search?: string,
  ) {
    return this.reportsService.getBrokerageWithheldReport(page ? Number(page) : 1, parseArnIds(arnProfileIds), search);
  }

  @Get("distributor/sip-stp-expiring-cams")
  getSipStpExpiringCams(
    @Query("page") page?: string,
    @Query("arnProfileIds") arnProfileIds?: string,
    @Query("search") search?: string,
  ) {
    return this.reportsService.getSipStpExpiringCamsReport(page ? Number(page) : 1, parseArnIds(arnProfileIds), search);
  }

  @Get("distributor/stp")
  getStp(@Query("page") page?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getStpReport(page ? Number(page) : 1, parseArnIds(arnProfileIds));
  }

  @Get("distributor/swp")
  getSwp(@Query("page") page?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getSwpReport(page ? Number(page) : 1, parseArnIds(arnProfileIds));
  }

  @Get("distributor/transaction-summary")
  getTransactionSummary(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getTransactionSummaryReport(parseArnIds(arnProfileIds));
  }

  @Get("distributor/client-returns")
  getClientReturns(@Query("arnProfileIds") arnProfileIds?: string) {
    return this.reportsService.getClientReturnsReport(parseArnIds(arnProfileIds));
  }
}
