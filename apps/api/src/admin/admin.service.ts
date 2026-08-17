import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { prisma } from "@mfd/db";
import { encryptSecret } from "@mfd/shared";
import { CreateDistributorDto } from "./dto/create-distributor.dto";
import { CreateChildArnProfileDto } from "./dto/create-child-arn-profile.dto";
import { logAdminAction } from "./audit-log";
import { sendOnboardingEmail } from "./onboarding-email";
import { ArnProfilesService } from "../arn-profiles/arn-profiles.service";
import { SaveCredentialDto } from "../arn-profiles/dto/save-credential.dto";

const BCRYPT_ROUNDS = 12;
/** Fixed default for every newly-onboarded MFD — not a secret (the MFD is expected to change it on first login), so returning it in the onboarding response is fine. */
const DEFAULT_ONBOARDING_PASSWORD = "Admin@123";

@Injectable()
export class AdminService {
  constructor(private readonly arnProfilesService: ArnProfilesService) {}

  /**
   * Login email is the parent ARN's registered CAMS mail id, not a
   * separately-supplied address — per the actual onboarding workflow, the
   * MFD signs in with the mail their RTA reports already get forwarded
   * to. Password always starts at a fixed default; mustChangePassword
   * forces them to set their own on first login.
   */
  async createDistributor(dto: CreateDistributorDto) {
    const passwordHash = await bcrypt.hash(DEFAULT_ONBOARDING_PASSWORD, BCRYPT_ROUNDS);
    const inboundMailDomain = process.env.INBOUND_MAIL_DOMAIN ?? "platform.example.com";
    const email = dto.arnProfile.camsMailId.toLowerCase();

    const distributor = await prisma.distributor.create({
      data: {
        name: dto.name,
        email,
        passwordHash,
        inboundEmailAlias: `inbound-ingest-${randomUUID()}@${inboundMailDomain}`,
        arnProfiles: { create: { ...dto.arnProfile } },
      },
      include: { arnProfiles: true },
    });

    const [parentArnProfile] = distributor.arnProfiles;
    if (dto.childArnProfiles?.length) {
      await prisma.arnProfile.createMany({
        data: dto.childArnProfiles.map((child) => ({
          ...child,
          distributorId: distributor.id,
          parentArnProfileId: parentArnProfile.id,
        })),
      });
    }

    await this.saveOnboardingCredentials(parentArnProfile.id, dto);

    const arnProfiles = await prisma.arnProfile.findMany({ where: { distributorId: distributor.id } });

    const emailResult = await sendOnboardingEmail({
      toEmail: email,
      distributorName: dto.name,
      arnNumber: dto.arnProfile.arnNumber,
      loginEmail: email,
      initialPassword: DEFAULT_ONBOARDING_PASSWORD,
    });

    await logAdminAction("CREATE_DISTRIBUTOR", distributor.id, {
      name: dto.name,
      arnNumber: dto.arnProfile.arnNumber,
      childArnCount: dto.childArnProfiles?.length ?? 0,
      welcomeEmailSent: emailResult.sent,
      welcomeEmailError: emailResult.error,
    });

    const { passwordHash: _passwordHash, ...safeDistributor } = distributor;
    return {
      ...safeDistributor,
      arnProfiles,
      loginEmail: email,
      initialPassword: DEFAULT_ONBOARDING_PASSWORD,
      welcomeEmailSent: emailResult.sent,
      welcomeEmailError: emailResult.error,
    };
  }

  /**
   * Saves whichever RTA zip/portal passwords were supplied at onboarding as
   * encrypted ExternalCredential rows against the parent ArnProfile, using
   * the same upsert-by-(arnProfileId, provider) shape ArnProfilesService
   * already uses — so the archive-decryption pipeline (which tries every
   * stored credential for a provider) can decrypt this MFD's mail the very
   * next time it's polled, with no separate manual "save credential" step.
   * Silently skips (rather than throwing) if no credentials were supplied
   * or the encryption key isn't configured, since onboarding itself must
   * still succeed either way.
   */
  private async saveOnboardingCredentials(arnProfileId: string, dto: CreateDistributorDto): Promise<void> {
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      return;
    }

    // Always inserts a new row (never upserts/overwrites) — see the
    // ExternalCredential model doc comment: RTA zip passwords rotate, so
    // history is kept rather than discarded.
    if (dto.camsZipPassword) {
      const { ciphertext, iv, authTag } = encryptSecret(
        JSON.stringify({ zipPassword: dto.camsZipPassword }),
        encryptionKey,
      );
      await prisma.externalCredential.create({
        data: { arnProfileId, provider: "CAMS", encryptedPayload: ciphertext, encryptionIv: iv, encryptionAuthTag: authTag },
      });
    }

    if (dto.kfintechZipPassword || dto.kfintechDssLoginId || dto.kfintechDssPassword) {
      const { ciphertext, iv, authTag } = encryptSecret(
        JSON.stringify({
          zipPassword: dto.kfintechZipPassword,
          dssLoginId: dto.kfintechDssLoginId,
          dssPassword: dto.kfintechDssPassword,
        }),
        encryptionKey,
      );
      await prisma.externalCredential.create({
        data: { arnProfileId, provider: "KFINTECH", encryptedPayload: ciphertext, encryptionIv: iv, encryptionAuthTag: authTag },
      });
    }
  }

  /**
   * Bulk variant for onboarding many MFDs from a CSV at once — same
   * create logic per row, isolated failures (one bad row doesn't abort
   * the rest). Expected columns: name, arnNumber, arnHolderName,
   * camsMailId (required), euinNumber, panNumber, phone, gstNumber,
   * kfintechDssLoginId, kfintechDssPassword, kfintechZipPassword,
   * camsZipPassword (all optional except the first four).
   */
  async createDistributorsBulk(rows: Array<Record<string, string>>) {
    const results: Array<{ row: number; success: boolean; name?: string; error?: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name || !row.arnNumber || !row.arnHolderName || !row.camsMailId) {
          throw new Error("Missing required column (name, arnNumber, arnHolderName, camsMailId)");
        }
        await this.createDistributor({
          name: row.name,
          arnProfile: {
            arnNumber: row.arnNumber,
            arnHolderName: row.arnHolderName,
            camsMailId: row.camsMailId,
            euinNumber: row.euinNumber || undefined,
            panNumber: row.panNumber || undefined,
            phone: row.phone || undefined,
            gstNumber: row.gstNumber || undefined,
          },
          kfintechDssLoginId: row.kfintechDssLoginId || undefined,
          kfintechDssPassword: row.kfintechDssPassword || undefined,
          kfintechZipPassword: row.kfintechZipPassword || undefined,
          camsZipPassword: row.camsZipPassword || undefined,
        });
        results.push({ row: i + 1, success: true, name: row.name });
      } catch (err) {
        results.push({ row: i + 1, success: false, name: row.name, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { total: rows.length, succeeded: results.filter((r) => r.success).length, results };
  }

  async addChildArnProfile(distributorId: string, dto: CreateChildArnProfileDto) {
    const { parentArnProfileId, ...arnFields } = dto;
    const created = await prisma.arnProfile.create({
      data: { ...arnFields, distributorId, parentArnProfileId },
    });
    await logAdminAction("ADD_CHILD_ARN", distributorId, { arnNumber: dto.arnNumber });
    return created;
  }

  /**
   * Admin-initiated reset — bypasses the current-password check in
   * AuthService.changePassword, which is for a logged-in distributor
   * changing their own password, not for support recovering a forgotten
   * one. Always resets to the same fixed default used at onboarding
   * ("Admin@123"), not an admin-chosen value — and forces a change-password
   * prompt on next login (mustChangePassword=true), same as onboarding.
   */
  async resetPassword(distributorId: string): Promise<{ newPassword: string }> {
    const passwordHash = await bcrypt.hash(DEFAULT_ONBOARDING_PASSWORD, BCRYPT_ROUNDS);
    await prisma.distributor.update({
      where: { id: distributorId },
      data: { passwordHash, mustChangePassword: true },
    });
    await logAdminAction("RESET_PASSWORD", distributorId);
    return { newPassword: DEFAULT_ONBOARDING_PASSWORD };
  }

  /** Full MFD roster for the super-admin panel — one row per distributor with aggregate stats, not per-ARN. Excludes soft-deleted MFDs by default (see softDeleteDistributor). */
  async listDistributors() {
    const distributors = await prisma.distributor.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        arnProfiles: { select: { id: true, arnNumber: true, arnHolderName: true, parentArnProfileId: true, camsMailId: true } },
        _count: { select: { clients: true, folios: true, transactions: true } },
      },
    });

    const lastSyncRows = await prisma.mailIngestionLog.groupBy({
      by: ["distributorId"],
      where: { distributorId: { not: null }, status: "COMPLETED" },
      _max: { updatedAt: true },
    });
    const lastSyncByDistributor = new Map(lastSyncRows.map((r) => [r.distributorId, r._max.updatedAt]));

    return distributors.map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      isActive: d.isActive,
      mustChangePassword: d.mustChangePassword,
      createdAt: d.createdAt,
      arnProfiles: d.arnProfiles,
      clientCount: d._count.clients,
      folioCount: d._count.folios,
      transactionCount: d._count.transactions,
      lastSyncAt: lastSyncByDistributor.get(d.id) ?? null,
    }));
  }

  async setActive(distributorId: string, isActive: boolean) {
    const distributor = await prisma.distributor.update({
      where: { id: distributorId },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });
    await logAdminAction(isActive ? "ENABLE_DISTRIBUTOR" : "DISABLE_DISTRIBUTOR", distributorId);
    return distributor;
  }

  /**
   * Soft delete only — no cascading hard-delete exists anywhere in this
   * schema (see Distributor.deletedAt's doc comment). Hides the MFD from
   * listDistributors and blocks login (isActive false), but every client/
   * folio/transaction/etc row stays intact and recoverable by clearing
   * deletedAt directly.
   */
  async softDeleteDistributor(distributorId: string) {
    const distributor = await prisma.distributor.update({
      where: { id: distributorId },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, name: true },
    });
    await logAdminAction("DELETE_DISTRIBUTOR", distributorId, { name: distributor.name });
    return distributor;
  }

  /** What zip password/portal login is currently live for an ARN's CAMS/KFintech decryption — see ArnProfilesService.getCredentials for the "why decrypt for viewing" rationale. */
  async getArnCredentials(distributorId: string, arnProfileId: string) {
    return this.arnProfilesService.getCredentials(distributorId, arnProfileId);
  }

  /**
   * Lets a super admin update an MFD's RTA zip password on their behalf
   * (e.g. CAMS/KFintech reissues one and the MFD reports it) without
   * needing the MFD to log in themselves. Same insert-new-row-never-
   * overwrite behavior as the distributor's own self-service endpoint —
   * just callable by an admin, targeting any distributor's ARN profile.
   */
  async saveArnCredential(distributorId: string, arnProfileId: string, dto: SaveCredentialDto) {
    const saved = await this.arnProfilesService.saveCredential(distributorId, arnProfileId, dto);
    await logAdminAction("UPDATE_ARN_CREDENTIAL", distributorId, { arnProfileId, provider: dto.provider });
    return saved;
  }

  async listAuditLog(distributorId?: string) {
    return prisma.adminAuditLog.findMany({
      where: distributorId ? { distributorId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { distributor: { select: { name: true } } },
    });
  }
}
