import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const distributor = await prisma.distributor.findUnique({ where: { email: email.toLowerCase() } });
    if (!distributor || !(await bcrypt.compare(password, distributor.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!distributor.isActive) {
      throw new UnauthorizedException("This account has been disabled. Contact your platform administrator.");
    }
    const accessToken = await this.jwtService.signAsync({ sub: distributor.id });
    return { accessToken, mustChangePassword: distributor.mustChangePassword };
  }

  async changePassword(
    distributorId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const distributor = await prisma.distributor.findUniqueOrThrow({
      where: { id: distributorId },
    });
    if (!(await bcrypt.compare(currentPassword, distributor.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // A voluntary password change is exactly the signal mustChangePassword
    // exists to wait for — clear it here, not just on admin-initiated reset.
    await prisma.distributor.update({
      where: { id: distributorId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}
