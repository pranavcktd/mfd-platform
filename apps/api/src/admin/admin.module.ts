import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./admin.guard";
import { StatusController } from "./status.controller";
import { StatusService } from "./status.service";
import { ArnProfilesModule } from "../arn-profiles/arn-profiles.module";

@Module({
  imports: [ArnProfilesModule],
  controllers: [AdminController, StatusController],
  providers: [AdminService, AdminGuard, StatusService],
})
export class AdminModule {}
