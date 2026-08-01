import { Controller, Get } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { TenantContext } from "../tenant/tenant-context";

@Controller("me")
export class ProfileController {
  @Get()
  getProfile() {
    return prisma.distributor.findUniqueOrThrow({
      where: { id: TenantContext.currentDistributorId() },
      select: { id: true, name: true, email: true, createdAt: true, mustChangePassword: true },
    });
  }
}
