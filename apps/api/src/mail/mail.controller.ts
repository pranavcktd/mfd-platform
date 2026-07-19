import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { MailService } from "./mail.service";

@UseGuards(AdminGuard)
@Controller("admin/mail")
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post("check-now")
  checkNow() {
    return this.mailService.triggerCheckNow();
  }

  @Get("logs")
  listLogs(
    @Query("rtaType") rtaType?: string,
    @Query("status") status?: string,
    @Query("date") date?: string,
  ) {
    return this.mailService.listLogs({ rtaType, status, date });
  }

  @Get("logs/summary")
  summary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.mailService.summarize({ from, to });
  }
}
