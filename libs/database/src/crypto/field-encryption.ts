import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';

/** Marks values already encrypted so encrypt is idempotent and plaintext can coexist during migration. */
export const FIELD_ENCRYPTION_PREFIX = 'enc:v1:';

/** Safe to return to API clients. Internal decrypt details stay in logs. */
export const FIELD_DECRYPT_CLIENT_ERROR =
  'Unable to load device credentials';

export class FieldDecryptError extends Error {
  constructor() {
    super('Failed to decrypt field (wrong key or corrupt ciphertext)');
    this.name = 'FieldDecryptError';
  }
}

const AES_KEY_LEN = 32;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const HKDF_SALT = 'careaccess-db-field';
const HKDF_INFO = 'enc:v1:aes-256-gcm';

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(FIELD_ENCRYPTION_PREFIX);
}

function deriveAesKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, AES_KEY_LEN),
  );
}

function decryptFailed(): never {
  throw new FieldDecryptError();
}

/**
 * Encrypt a DB field for at-rest storage. Null/empty pass through.
 * Already-prefixed values are returned unchanged (no double-encrypt).
 *
 * Wire format: `enc:v1:` + base64(iv || authTag || ciphertext)
 * Cipher: AES-256-GCM. Key: HKDF-SHA256 of DB_FIELD_ENCRYPTION_KEY.
 */
export function encryptField(
  value: string | null | undefined,
  key: string,
): string | null {
  if (value == null || value === '') {
    return value ?? null;
  }
  if (isEncryptedField(value)) {
    return value;
  }

  const aesKey = deriveAesKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);

  return FIELD_ENCRYPTION_PREFIX + packed.toString('base64');
}

/**
 * Decrypt a DB field. Legacy plaintext (no prefix) is returned as-is.
 */
export function decryptField(
  value: string | null | undefined,
  key: string,
): string | null {
  if (value == null || value === '') {
    return value ?? null;
  }
  if (!isEncryptedField(value)) {
    return value;
  }

  const packed = Buffer.from(
    value.slice(FIELD_ENCRYPTION_PREFIX.length),
    'base64',
  );
  if (packed.length < IV_LEN + AUTH_TAG_LEN) {
    decryptFailed();
  }

  const iv = packed.subarray(0, IV_LEN);
  const authTag = packed.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + AUTH_TAG_LEN);

  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveAesKey(key), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    decryptFailed();
  }
}
