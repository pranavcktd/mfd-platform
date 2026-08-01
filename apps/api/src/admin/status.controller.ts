import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminGuard } from "./admin.guard";
import { StatusService } from "./status.service";

@UseGuards(AdminGuard)
@Controller("admin/status")
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get()
  getStatus() {
    return this.statusService.getStatus();
  }

  @Get("sync-health")
  getSyncHealth() {
    return this.statusService.getSyncHealth();
  }
}
