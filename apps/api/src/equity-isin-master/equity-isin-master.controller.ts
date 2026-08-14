import { BadRequestException, Body, Controller, Get, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { EquityIsinMasterService } from "./equity-isin-master.service";
import { AdminGuard } from "../admin/admin.guard";
import { ImportEquityIsinMasterDto } from "./dto/import-equity-isin-master.dto";

/** Tenant-facing — any logged-in MFD can search the master (used by the Other Assets equity-shares form); the data itself is global, not distributor-scoped, so no tenant filtering applies here. */
@Controller("equity-isin-master")
export class EquityIsinMasterController {
  constructor(private readonly equityIsinMasterService: EquityIsinMasterService) {}

  @Get("search")
  search(@Query("q") q?: string) {
    return this.equityIsinMasterService.search(q ?? "");
  }
}

/** Admin-only — importing/refreshing the global master is a platform-level operation, not something an individual MFD triggers. */
@UseGuards(AdminGuard)
@Controller("admin/equity-isin-master")
export class EquityIsinMasterAdminController {
  constructor(private readonly equityIsinMasterService: EquityIsinMasterService) {}

  @Post("import")
  importFromFolder(@Body() dto: ImportEquityIsinMasterDto) {
    return this.equityIsinMasterService.importFromFolder(dto.folderPath);
  }

  @Post("upload")
  @UseInterceptors(FileFieldsInterceptor([{ name: "nseFile", maxCount: 1 }, { name: "bseFile", maxCount: 1 }]))
  importFromUpload(@UploadedFiles() files: { nseFile?: Express.Multer.File[]; bseFile?: Express.Multer.File[] }) {
    const nse = files.nseFile?.[0];
    const bse = files.bseFile?.[0];
    if (!nse || !bse) {
      throw new BadRequestException("Both an NSE file and a BSE file are required");
    }
    return this.equityIsinMasterService.importFromUpload(nse.buffer, nse.originalname, bse.buffer, bse.originalname);
  }

  @Get("logs")
  listLogs(@Query("page") page?: string) {
    return this.equityIsinMasterService.listLogs(page ? Number(page) : 1);
  }

  @Get("data")
  listData(@Query("page") page?: string, @Query("search") search?: string) {
    return this.equityIsinMasterService.listData(page ? Number(page) : 1, search);
  }
}
