import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../env/env.constants';
import {
  decryptField,
  encryptField,
  FIELD_DECRYPT_CLIENT_ERROR,
  FieldDecryptError,
  isEncryptedField,
} from './field-encryption';

@Injectable()
export class FieldCryptoService {
  private readonly logger = new Logger(FieldCryptoService.name);

  constructor(private readonly configService: ConfigService) {}

  private get key(): string {
    return this.configService.getOrThrow<string>(
      EnvConstants.DB_FIELD_ENCRYPTION_KEY,
    );
  }

  encrypt(value: string | null | undefined): string | null {
    if (value == null || value === '') {
      return value ?? null;
    }
    return encryptField(value, this.key);
  }

  decrypt(value: string | null | undefined): string | null {
    if (value == null || value === '') {
      return value ?? null;
    }
    if (!isEncryptedField(value)) {
      return value;
    }
    try {
      return decryptField(value, this.key);
    } catch (error) {
      if (error instanceof FieldDecryptError) {
        this.logger.error(error.message);
        throw new HttpException(
          {
            success: false,
            errors: [FIELD_DECRYPT_CLIENT_ERROR],
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw error;
    }
  }
}
