import {
  decryptField,
  encryptField,
  FIELD_ENCRYPTION_PREFIX,
  FieldDecryptError,
  isEncryptedField,
} from './field-encryption';

describe('field-encryption', () => {
  const key = 'test-db-field-encryption-key';

  it('encrypts and decrypts round-trip', () => {
    const plain = JSON.stringify({ access_token: 'abc' });
    const encrypted = encryptField(plain, key);
    expect(encrypted).toMatch(new RegExp(`^${FIELD_ENCRYPTION_PREFIX}`));
    expect(decryptField(encrypted, key)).toBe(plain);
  });

  it('uses a new IV so the same plaintext does not produce the same ciphertext', () => {
    const a = encryptField('secret', key);
    const b = encryptField('secret', key);
    expect(a).not.toBe(b);
    expect(decryptField(a, key)).toBe('secret');
    expect(decryptField(b, key)).toBe('secret');
  });

  it('does not double-encrypt', () => {
    const once = encryptField('secret', key);
    expect(encryptField(once, key)).toBe(once);
  });

  it('returns legacy plaintext unchanged on decrypt', () => {
    expect(decryptField('legacy-plain', key)).toBe('legacy-plain');
    expect(isEncryptedField('legacy-plain')).toBe(false);
  });

  it('passes through null and empty', () => {
    expect(encryptField(null, key)).toBeNull();
    expect(encryptField('', key)).toBe('');
    expect(decryptField(null, key)).toBeNull();
  });

  it('rejects the wrong key', () => {
    const encrypted = encryptField('secret', key);
    expect(() => decryptField(encrypted, 'other-key')).toThrow(
      FieldDecryptError,
    );
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptField('secret', key);
    const packed = Buffer.from(
      encrypted.slice(FIELD_ENCRYPTION_PREFIX.length),
      'base64',
    );
    packed[packed.length - 1] ^= 0xff;
    const tampered =
      FIELD_ENCRYPTION_PREFIX + packed.toString('base64');
    expect(() => decryptField(tampered, key)).toThrow(FieldDecryptError);
  });
});
