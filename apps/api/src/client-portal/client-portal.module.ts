import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { ClientPortalService } from "./client-portal.service";
import { ClientPortalController } from "./client-portal.controller";

@Module({
  imports: [ReportsModule],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
