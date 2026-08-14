import { Controller, Get, Query } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  getSummary(@Query("arnProfileIds") arnProfileIds?: string) {
    const ids = arnProfileIds
      ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.dashboardService.getSummary(ids);
  }

  @Get("recent-clients")
  getRecentClients(@Query("arnProfileIds") arnProfileIds?: string, @Query("page") page?: string) {
    const ids = arnProfileIds
      ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.dashboardService.getRecentClients(ids, page ? Number(page) : 1);
  }

  @Get("aum-change")
  getAumChange(@Query("days") days?: string, @Query("arnProfileIds") arnProfileIds?: string) {
    const ids = arnProfileIds
      ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.dashboardService.getAumChange(days ? Number(days) : 1, ids);
  }

  @Get("unclassified-folios")
  getUnclassifiedFolios(@Query("arnProfileIds") arnProfileIds?: string) {
    const ids = arnProfileIds
      ? arnProfileIds.split(",").map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.dashboardService.getUnclassifiedFolios(ids);
  }
}
