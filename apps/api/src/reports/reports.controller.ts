import { Controller, Get, Query } from "@nestjs/common";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("aum")
  getAum() {
    return this.reportsService.getAumReport();
  }

  @Get("transactions")
  getTransactions(
    @Query("type") type?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
  ) {
    return this.reportsService.getTransactionsReport({ type, from, to, page: page ? Number(page) : 1 });
  }

  @Get("sip")
  getSip(@Query("status") status?: "new" | "active" | "ceased", @Query("page") page?: string) {
    return this.reportsService.getSipReport(status, page ? Number(page) : 1);
  }

  @Get("holdings")
  getHoldings(@Query("clientId") clientId?: string, @Query("page") page?: string) {
    return this.reportsService.getHoldingsReport(clientId, page ? Number(page) : 1);
  }

  @Get("net-worth")
  getNetWorth(@Query("page") page?: string) {
    return this.reportsService.getNetWorthReport(page ? Number(page) : 1);
  }

  @Get("valuation")
  getValuation(@Query("page") page?: string) {
    return this.reportsService.getValuationReport(page ? Number(page) : 1);
  }

  @Get("brokerage/summary")
  getBrokerageSummary() {
    return this.reportsService.getBrokerageSummary();
  }

  @Get("brokerage/transactions")
  getBrokerageTransactions(@Query("page") page?: string) {
    return this.reportsService.getBrokerageTransactions(page ? Number(page) : 1);
  }
}
