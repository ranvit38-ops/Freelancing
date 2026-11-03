import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Encrypts a secret a lab hands us, such as its own Anthropic key, so a copy
 * of the database alone does not give it away.
 *
 * AES-256-GCM, with the key derived from LABFLOW_ENCRYPTION_KEY. Unset, there
 * is nothing to encrypt with, so callers refuse to store a secret at all
 * rather than keep it in the clear. Changing the variable makes stored
 * secrets unreadable: they read as absent and the lab adds its key again.
 */
export function encryptionConfigured(): boolean {
  return Boolean(process.env.LABFLOW_ENCRYPTION_KEY?.trim());
}

function key(): Buffer {
  const secret = process.env.LABFLOW_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error('LABFLOW_ENCRYPTION_KEY is not set, so secrets cannot be stored.');
  return createHash('sha256').update(secret).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

/** The secret, or null when it cannot be read (no key, wrong key, damaged). */
export function open(sealed: string | null | undefined): string | null {
  if (!sealed?.startsWith('v1:') || !encryptionConfigured()) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
