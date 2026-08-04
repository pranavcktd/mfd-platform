import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { NavService } from "./nav.service";

@UseGuards(AdminGuard)
@Controller("admin/nav")
export class NavController {
  constructor(private readonly navService: NavService) {}

  @Post("check-now")
  checkNow() {
    return this.navService.triggerCheckNow();
  }

  @Post("backfill-history")
  backfillHistory(@Body("fromDate") fromDate: string, @Body("toDate") toDate: string) {
    return this.navService.triggerHistoryBackfill(fromDate, toDate);
  }

  @Get("logs")
  listLogs() {
    return this.navService.listLogs();
  }
}
