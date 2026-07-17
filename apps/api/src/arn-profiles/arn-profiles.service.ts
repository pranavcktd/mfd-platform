import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@mfd/db";
import { encryptSecret, maskPan } from "@mfd/shared";
import { SaveCredentialDto } from "./dto/save-credential.dto";

@Injectable()
export class ArnProfilesService {
  async listForDistributor(distributorId: string) {
    const arnProfiles = await prisma.arnProfile.findMany({ where: { distributorId } });
    return arnProfiles.map((profile) => ({ ...profile, panNumber: maskPan(profile.panNumber) }));
  }

  async saveCredential(distributorId: string, arnProfileId: string, dto: SaveCredentialDto) {
    const arnProfile = await prisma.arnProfile.findUnique({ where: { id: arnProfileId } });
    if (!arnProfile) {
      throw new NotFoundException("ARN profile not found");
    }
    if (arnProfile.distributorId !== distributorId) {
      throw new ForbiddenException("ARN profile does not belong to this distributor");
    }

    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
    }
    const { ciphertext, iv, authTag } = encryptSecret(JSON.stringify(dto.payload), encryptionKey);

    const saved = await prisma.externalCredential.upsert({
      where: { arnProfileId_provider: { arnProfileId, provider: dto.provider } },
      create: {
        arnProfileId,
        provider: dto.provider,
        encryptedPayload: ciphertext,
        encryptionIv: iv,
        encryptionAuthTag: authTag,
      },
      update: {
        encryptedPayload: ciphertext,
        encryptionIv: iv,
        encryptionAuthTag: authTag,
      },
    });

    return { provider: saved.provider, updatedAt: saved.updatedAt };
  }
}
