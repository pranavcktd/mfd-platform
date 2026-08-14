import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  // Exported so ClientPortalModule can reuse the capital-gains FIFO/tax
  // computation (getCapitalGainsReport/getCapitalGainsDetailReport) rather
  // than duplicating that logic for the client-portal's own capital gains
  // view — see ClientPortalService.getMyCapitalGains.
  exports: [ReportsService],
})
export class ReportsModule {}
