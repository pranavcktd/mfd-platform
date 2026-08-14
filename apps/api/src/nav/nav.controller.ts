import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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

  @Post("manual-upload")
  @UseInterceptors(FileInterceptor("file"))
  manualUpload(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.navService.manualUpload(file);
  }

  @Post("backfill-history")
  backfillHistory(@Body("fromDate") fromDate: string, @Body("toDate") toDate: string) {
    return this.navService.triggerHistoryBackfill(fromDate, toDate);
  }

  @Get("logs")
  listLogs() {
    return this.navService.listLogs();
  }

  @Get("logs/:id/data")
  logData(@Param("id") id: string, @Query("page") page?: string, @Query("search") search?: string) {
    return this.navService.getLogData(id, page ? Number(page) : 1, search);
  }
}
