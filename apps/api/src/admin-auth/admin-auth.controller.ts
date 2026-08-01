import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminChangePasswordDto } from "./dto/admin-change-password.dto";
import { AdminGuard } from "../admin/admin.guard";

@Controller("admin-auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto.username, dto.password);
  }

  @UseGuards(AdminGuard)
  @Patch("change-password")
  async changePassword(@Body() dto: AdminChangePasswordDto) {
    await this.adminAuthService.changePassword(dto.currentPassword, dto.newPassword);
    return { status: "ok" };
  }

  /** Recovery path — requires the master x-admin-key (proves you're the real operator), not the current username/password (the whole point is recovering when that's forgotten). */
  @UseGuards(AdminGuard)
  @Post("reset-to-default")
  resetToDefault() {
    return this.adminAuthService.resetToDefault();
  }
}
