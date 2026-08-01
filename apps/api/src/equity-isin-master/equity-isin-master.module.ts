import { Module } from "@nestjs/common";
import { EquityIsinMasterController, EquityIsinMasterAdminController } from "./equity-isin-master.controller";
import { EquityIsinMasterService } from "./equity-isin-master.service";

@Module({
  controllers: [EquityIsinMasterController, EquityIsinMasterAdminController],
  providers: [EquityIsinMasterService],
})
export class EquityIsinMasterModule {}
