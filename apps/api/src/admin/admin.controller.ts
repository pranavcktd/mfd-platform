import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { CreateDistributorDto } from "./dto/create-distributor.dto";
import { CreateChildArnProfileDto } from "./dto/create-child-arn-profile.dto";
import { SetActiveDto } from "./dto/set-active.dto";
import { BulkOnboardDto } from "./dto/bulk-onboard.dto";
import { SaveCredentialDto } from "../arn-profiles/dto/save-credential.dto";

@UseGuards(AdminGuard)
@Controller("admin/distributors")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listDistributors() {
    return this.adminService.listDistributors();
  }

  @Get("audit-log")
  listAuditLog(@Query("distributorId") distributorId?: string) {
    return this.adminService.listAuditLog(distributorId);
  }

  @Post()
  createDistributor(@Body() dto: CreateDistributorDto) {
    return this.adminService.createDistributor(dto);
  }

  @Post("bulk")
  createDistributorsBulk(@Body() dto: BulkOnboardDto) {
    const rows: Array<Record<string, string>> = parse(dto.csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    return this.adminService.createDistributorsBulk(rows);
  }

  @Post(":distributorId/arn-profiles")
  addChildArnProfile(
    @Param("distributorId") distributorId: string,
    @Body() dto: CreateChildArnProfileDto,
  ) {
    return this.adminService.addChildArnProfile(distributorId, dto);
  }

  @Patch(":distributorId/reset-password")
  resetPassword(@Param("distributorId") distributorId: string) {
    return this.adminService.resetPassword(distributorId);
  }

  @Get(":distributorId/arn-profiles/:arnProfileId/credentials")
  getArnCredentials(@Param("distributorId") distributorId: string, @Param("arnProfileId") arnProfileId: string) {
    return this.adminService.getArnCredentials(distributorId, arnProfileId);
  }

  @Post(":distributorId/arn-profiles/:arnProfileId/credentials")
  saveArnCredential(
    @Param("distributorId") distributorId: string,
    @Param("arnProfileId") arnProfileId: string,
    @Body() dto: SaveCredentialDto,
  ) {
    return this.adminService.saveArnCredential(distributorId, arnProfileId, dto);
  }

  @Patch(":distributorId/status")
  setActive(@Param("distributorId") distributorId: string, @Body() dto: SetActiveDto) {
    return this.adminService.setActive(distributorId, dto.isActive);
  }

  @Delete(":distributorId")
  softDelete(@Param("distributorId") distributorId: string) {
    return this.adminService.softDeleteDistributor(distributorId);
  }
}
