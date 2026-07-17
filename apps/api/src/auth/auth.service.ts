import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const distributor = await prisma.distributor.findUnique({ where: { email } });
    if (!distributor || !(await bcrypt.compare(password, distributor.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const accessToken = await this.jwtService.signAsync({ sub: distributor.id });
    return { accessToken };
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
    await prisma.distributor.update({ where: { id: distributorId }, data: { passwordHash } });
  }
}
