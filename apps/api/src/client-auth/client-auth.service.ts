import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class ClientAuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Login id is the client's PAN, not email (2026-07-23 design change) —
   * PAN is the canonical investor identifier in this domain, and unlike
   * email it's always present for any client with real KYC on file.
   * Client.panNumber isn't a globally-unique column either (only unique
   * per-distributor via @@unique([distributorId, panNumber])) — the same
   * real investor could in theory hold accounts at two different MFDs —
   * but CrmService.createPortalLogin enforces uniqueness among
   * portalEnabled=true clients at write time, so this lookup can safely
   * assume at most one match in practice.
   */
  async login(panNumber: string, password: string): Promise<{ accessToken: string; mustChangePassword: boolean }> {
    const client = await prisma.client.findFirst({ where: { panNumber: panNumber.toUpperCase(), portalEnabled: true } });
    if (!client || !client.passwordHash || !(await bcrypt.compare(password, client.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const accessToken = await this.jwtService.signAsync({
      sub: client.id,
      distributorId: client.distributorId,
      type: "client",
    });
    return { accessToken, mustChangePassword: client.mustChangePassword };
  }

  async changePassword(clientId: string, currentPassword: string, newPassword: string): Promise<void> {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    if (!client.passwordHash || !(await bcrypt.compare(currentPassword, client.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.client.update({
      where: { id: clientId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}
