import { Body, Controller, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { TenantContext } from "../tenant/tenant-context";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Patch("change-password")
  async changePassword(@Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(
      TenantContext.currentDistributorId(),
      dto.currentPassword,
      dto.newPassword,
    );
    return { status: "ok" };
  }
}
