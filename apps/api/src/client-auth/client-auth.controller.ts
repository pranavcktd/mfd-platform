import { Body, Controller, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { ClientAuthService } from "./client-auth.service";
import { ClientLoginDto } from "./dto/client-login.dto";
import { ClientChangePasswordDto } from "./dto/client-change-password.dto";
import { ClientTenantContext } from "../client-tenant/client-tenant-context";

@Controller("client-auth")
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: ClientLoginDto) {
    return this.clientAuthService.login(dto.panNumber, dto.password);
  }

  @Patch("change-password")
  async changePassword(@Body() dto: ClientChangePasswordDto) {
    await this.clientAuthService.changePassword(
      ClientTenantContext.current().clientId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { status: "ok" };
  }
}
