import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * App-layer encryption for Plaid access tokens (AES-256-GCM).
 *
 * With ENCRYPTION_KEY set, tokens are encrypted before touching the database —
 * a leaked DB alone yields no usable tokens; the attacker would also need the
 * key from your app environment. Generate a key with: openssl rand -hex 32
 *
 * Values are versioned ("enc:v1:...") and plaintext values still decrypt as-is,
 * so enabling the key later is safe: existing rows are migrated lazily on sync.
 */

const PREFIX = "enc:v1:";

export function encryptionEnabled(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

function key(): Buffer {
  // Accept any string; derive a stable 32-byte key
  return createHash("sha256").update(process.env.ENCRYPTION_KEY!).digest();
}

export function encryptToken(plain: string): string {
  if (!encryptionEnabled()) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // plaintext (pre-encryption row)
  if (!encryptionEnabled()) {
    throw new Error("Encrypted token found but ENCRYPTION_KEY is not set.");
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
