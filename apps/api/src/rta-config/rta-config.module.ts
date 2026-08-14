import { Module } from "@nestjs/common";
import { RtaConfigController } from "./rta-config.controller";
import { RtaConfigService } from "./rta-config.service";

@Module({
  controllers: [RtaConfigController],
  providers: [RtaConfigService],
})
export class RtaConfigModule {}
