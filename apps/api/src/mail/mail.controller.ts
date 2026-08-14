import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { MailService, type MailSourceFilter } from "./mail.service";
import { FolderImportDto } from "./dto/folder-import.dto";
import { FolderImportPreviewDto } from "./dto/folder-import-preview.dto";

function parseSource(raw?: string): MailSourceFilter | undefined {
  return raw === "folder-import" || raw === "live" ? raw : undefined;
}

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

  @Post("folder-import/preview")
  folderImportPreview(@Body() dto: FolderImportPreviewDto) {
    return this.mailService.previewFolderImport(dto);
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

  @Get("last-sync")
  lastSync() {
    return this.mailService.getLastSyncByRta();
  }

  @Get("logs")
  listLogs(
    @Query("rtaType") rtaType?: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
    @Query("source") source?: string,
  ) {
    return this.mailService.listLogs({ rtaType, status, from, to, distributorId, arnProfileId, source: parseSource(source) });
  }

  @Get("logs/summary")
  summary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
    @Query("source") source?: string,
  ) {
    return this.mailService.summarize({ from, to, distributorId, arnProfileId, source: parseSource(source) });
  }

  @Get("report-types")
  reportTypes(
    @Query("rtaType") rtaType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
    @Query("source") source?: string,
  ) {
    return this.mailService.getReportTypesSummary({ rtaType, from, to, distributorId, arnProfileId, source: parseSource(source) });
  }

  @Get("inserted-data")
  insertedData(
    @Query("rtaType") rtaType?: string,
    @Query("reportCode") reportCode?: string,
    @Query("date") date?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("distributorId") distributorId?: string,
    @Query("arnProfileId") arnProfileId?: string,
    @Query("source") source?: string,
  ) {
    return this.mailService.getInsertedData({ rtaType, reportCode, date, from, to, distributorId, arnProfileId, source: parseSource(source) });
  }
}
