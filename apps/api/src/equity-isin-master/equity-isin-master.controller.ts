import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
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
}
