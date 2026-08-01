import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";

const BCRYPT_ROUNDS = 12;
const DEFAULT_USERNAME = "Admin";
const DEFAULT_PASSWORD = "Admin@123";

@Injectable()
export class AdminAuthService {
  /**
   * Ensures the single seeded super-admin account exists — idempotent,
   * called once at API startup (see main.ts). Single-operator model: this
   * table only ever needs the one "Admin" row, not a full user-management
   * system.
   */
  async ensureSeeded(): Promise<void> {
    const existing = await prisma.superAdminUser.findFirst();
    if (existing) {
      return;
    }
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
    await prisma.superAdminUser.create({ data: { username: DEFAULT_USERNAME, passwordHash } });
  }

  /**
   * A friendlier front door in front of the pre-existing static
   * `x-admin-key` mechanism, not a replacement for it — on success, hands
   * back the SAME ADMIN_API_KEY value every admin/* route already checks
   * via AdminGuard, so nothing about how those routes authorize changes.
   */
  async login(username: string, password: string): Promise<{ adminKey: string }> {
    const user = await prisma.superAdminUser.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      throw new Error("ADMIN_API_KEY is not configured");
    }
    return { adminKey };
  }

  /** Reachable only by someone who already holds the master x-admin-key (AdminGuard) — verifies the current username/password too, matching the self-service change-password convention used elsewhere. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.superAdminUser.findUniqueOrThrow({ where: { username: DEFAULT_USERNAME } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.superAdminUser.update({ where: { id: user.id }, data: { passwordHash } });
  }

  /** Recovery path, guarded by AdminGuard (the master key) — resets straight back to the fixed default, no current-password check needed since this IS the "I forgot it" path. */
  async resetToDefault(): Promise<{ username: string; password: string }> {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
    await prisma.superAdminUser.update({ where: { username: DEFAULT_USERNAME }, data: { passwordHash } });
    return { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD };
  }
}
