import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function loadKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("Encryption key must decode to 32 bytes (AES-256)");
  }
  return key;
}

export function encryptSecret(plaintext: string, keyBase64: string): EncryptedSecret {
  const key = loadKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret, keyBase64: string): string {
  const key = loadKey(keyBase64);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
