import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, ExternalProvider } from "@mfd/db";
import { encryptSecret, decryptSecret } from "@mfd/shared";
import { SaveCredentialDto } from "./dto/save-credential.dto";

@Injectable()
export class ArnProfilesService {
  async listForDistributor(distributorId: string) {
    return prisma.arnProfile.findMany({ where: { distributorId } });
  }

  private async assertOwnership(distributorId: string, arnProfileId: string) {
    const arnProfile = await prisma.arnProfile.findUnique({ where: { id: arnProfileId } });
    if (!arnProfile) {
      throw new NotFoundException("ARN profile not found");
    }
    if (arnProfile.distributorId !== distributorId) {
      throw new ForbiddenException("ARN profile does not belong to this distributor");
    }
  }

  async saveCredential(distributorId: string, arnProfileId: string, dto: SaveCredentialDto) {
    await this.assertOwnership(distributorId, arnProfileId);

    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
    }
    const { ciphertext, iv, authTag } = encryptSecret(JSON.stringify(dto.payload), encryptionKey);

    // Always inserts a new row rather than overwriting the existing one —
    // see the ExternalCredential model doc comment: RTA zip passwords
    // rotate over time, and the old value can still be needed for older
    // archives, so nothing is ever discarded.
    const saved = await prisma.externalCredential.create({
      data: {
        arnProfileId,
        provider: dto.provider,
        encryptedPayload: ciphertext,
        encryptionIv: iv,
        encryptionAuthTag: authTag,
      },
    });

    return { provider: saved.provider, updatedAt: saved.updatedAt };
  }

  /**
   * The currently-live (most recent) CAMS/KFintech credential per provider,
   * decrypted — so a super admin can actually see what zip password the
   * archive-decryption pipeline is trying first, and confirm it still
   * matches what the RTA has on file, instead of having to guess at a
   * write-only vault. Full history (older rotated passwords) stays in the
   * DB for the pipeline's own fallback search but isn't surfaced here —
   * only "what's live right now" matters for this view.
   */
  async getCredentials(distributorId: string, arnProfileId: string) {
    await this.assertOwnership(distributorId, arnProfileId);
    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
    }

    const results: Array<{ provider: ExternalProvider; payload: Record<string, string>; updatedAt: Date }> = [];
    for (const provider of [ExternalProvider.CAMS, ExternalProvider.KFINTECH] as const) {
      const latest = await prisma.externalCredential.findFirst({
        where: { arnProfileId, provider },
        orderBy: { createdAt: "desc" },
      });
      if (!latest) continue;
      const payload = JSON.parse(
        decryptSecret({ ciphertext: latest.encryptedPayload, iv: latest.encryptionIv, authTag: latest.encryptionAuthTag }, encryptionKey),
      );
      results.push({ provider, payload, updatedAt: latest.updatedAt });
    }
    return results;
  }
}
