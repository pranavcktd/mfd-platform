import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { CreateDistributorDto } from "./dto/create-distributor.dto";
import { CreateChildArnProfileDto } from "./dto/create-child-arn-profile.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@UseGuards(AdminGuard)
@Controller("admin/distributors")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  createDistributor(@Body() dto: CreateDistributorDto) {
    return this.adminService.createDistributor(dto);
  }

  @Post(":distributorId/arn-profiles")
  addChildArnProfile(
    @Param("distributorId") distributorId: string,
    @Body() dto: CreateChildArnProfileDto,
  ) {
    return this.adminService.addChildArnProfile(distributorId, dto);
  }

  @Patch(":distributorId/reset-password")
  resetPassword(@Param("distributorId") distributorId: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetPassword(distributorId, dto);
  }
}
