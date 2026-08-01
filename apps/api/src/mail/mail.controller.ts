import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { MailService } from "./mail.service";
import { FolderImportDto } from "./dto/folder-import.dto";

@UseGuards(AdminGuard)
@Controller("admin/mail")
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Post("check-now")
  checkNow() {
    return this.mailService.triggerCheckNow();
  }

  @Post("folder-import")
  folderImport(@Body() dto: FolderImportDto) {
    return this.mailService.triggerFolderImport(dto);
  }

  @Post("pause-schedule")
  pauseSchedule() {
    return this.mailService.pauseSchedule();
  }

  @Post("resume-schedule")
  resumeSchedule() {
    return this.mailService.resumeSchedule();
  }

  @Get("schedule-status")
  scheduleStatus() {
    return this.mailService.getScheduleStatus();
  }

  @Get("logs")
  listLogs(
    @Query("rtaType") rtaType?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
  ) {
    return this.mailService.listLogs({ rtaType, status, from, to, distributorId, arnProfileId });
  }

  @Get("logs/summary")
  summary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
  ) {
    return this.mailService.summarize({ from, to, distributorId, arnProfileId });
  }
}
