import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ArnProfilesService } from "./arn-profiles.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";
import { TenantContext } from "../tenant/tenant-context";

@Controller("arn-profiles")
export class ArnProfilesController {
  constructor(private readonly arnProfilesService: ArnProfilesService) {}

  @Get()
  list() {
    return this.arnProfilesService.listForDistributor(TenantContext.currentDistributorId());
  }

  @Post(":arnProfileId/credentials")
  saveCredential(@Param("arnProfileId") arnProfileId: string, @Body() dto: SaveCredentialDto) {
    return this.arnProfilesService.saveCredential(
      TenantContext.currentDistributorId(),
      arnProfileId,
      dto,
    );
  }
}
