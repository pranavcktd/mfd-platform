import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import { CreateDistributorDto } from "./dto/create-distributor.dto";
import { CreateChildArnProfileDto } from "./dto/create-child-arn-profile.dto";

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
}
