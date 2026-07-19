import { prisma, ExternalProvider } from "@mfd/db";
import { decryptSecret } from "@mfd/shared";

export interface DecryptedCredential {
  distributorId: string;
  arnProfileId: string;
  payload: Record<string, string>;
}

function requireEncryptionKey(): string {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  }
  return key;
}

/**
 * Decrypts and returns every stored credential for a provider, optionally
 * narrowed to one distributor. Used when the caller doesn't yet know which
 * tenant a piece of RTA data belongs to (e.g. archive decryption trying
 * each onboarded MFD's zip password in turn).
 */
export async function listDecryptedCredentials(
  provider: ExternalProvider,
  distributorId?: string,
): Promise<DecryptedCredential[]> {
  const encryptionKey = requireEncryptionKey();
  const credentials = await prisma.externalCredential.findMany({
    where: {
      provider,
      ...(distributorId ? { arnProfile: { distributorId } } : {}),
    },
    include: { arnProfile: { select: { distributorId: true } } },
  });

  return credentials.map((cred) => ({
    distributorId: cred.arnProfile.distributorId,
    arnProfileId: cred.arnProfileId,
    payload: JSON.parse(
      decryptSecret(
        { ciphertext: cred.encryptedPayload, iv: cred.encryptionIv, authTag: cred.encryptionAuthTag },
        encryptionKey,
      ),
    ),
  }));
}
