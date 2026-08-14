import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../admin/admin.guard";
import { RtaConfigService } from "./rta-config.service";

@UseGuards(AdminGuard)
@Controller("admin/rta-config")
export class RtaConfigController {
  constructor(private readonly rtaConfigService: RtaConfigService) {}

  @Get()
  list() {
    return this.rtaConfigService.list();
  }

  @Put(":rtaType")
  update(@Param("rtaType") rtaType: string, @Body("senderIdentifier") senderIdentifier: string) {
    return this.rtaConfigService.update(rtaType, senderIdentifier);
  }
}
