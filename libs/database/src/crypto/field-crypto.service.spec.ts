import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../env/env.constants';
import { FieldCryptoService } from './field-crypto.service';
import {
  encryptField,
  FIELD_DECRYPT_CLIENT_ERROR,
} from './field-encryption';

describe('FieldCryptoService', () => {
  const key = 'test-db-field-encryption-key';

  function createService(secret: string): FieldCryptoService {
    return new FieldCryptoService({
      getOrThrow: (name: string) => {
        if (name === EnvConstants.DB_FIELD_ENCRYPTION_KEY) {
          return secret;
        }
        throw new Error(`unexpected env ${name}`);
      },
    } as unknown as ConfigService);
  }

  it('round-trips with the configured key', () => {
    const service = createService(key);
    const encrypted = service.encrypt('secret');
    expect(service.decrypt(encrypted)).toBe('secret');
  });

  it('returns a formatted HttpException when ciphertext cannot be decrypted', () => {
    const ciphertext = encryptField('secret', key);
    const service = createService('other-key');

    expect(() => service.decrypt(ciphertext)).toThrow(HttpException);

    try {
      service.decrypt(ciphertext);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect((error as HttpException).getResponse()).toEqual({
        success: false,
        errors: [FIELD_DECRYPT_CLIENT_ERROR],
      });
    }
  });
});
