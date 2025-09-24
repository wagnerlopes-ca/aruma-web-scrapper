import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  API_VERSION: string;

  @IsString()
  @IsNotEmpty()
  PORT: string;

  @IsString()
  @IsNotEmpty()
  LOG_LEVELS: string;

  @IsString()
  @IsNotEmpty()
  WEBHOOK_NOTIFICATION_URL: string;

  @IsString()
  @IsNotEmpty()
  NOTIFICATION_SIGNATURE: string;

  @IsString()
  @IsNotEmpty()
  NOTIFICATION_BASIC_AUTH: string;

  @IsString()
  @IsNotEmpty()
  NOTIFICATION_TO_EMAIL_TEST: string;

  @IsString()
  @IsNotEmpty()
  NOTIFICATION_FROM_EMAIL: string;

  @IsString()
  @IsNotEmpty()
  AUTH_BEARER_SECRET: string;

  @IsString()
  @IsNotEmpty()
  AUTH_BEARER_EXPIRES_IN_TIME_TOKEN_BEARER: string;

  @IsString()
  @IsNotEmpty()
  PARTICIPANTS_SYNC_BATCH_INTERVAL: string;
  
  @IsString()
  @IsNotEmpty()
  PARTICIPANTS_SYNC_BATCH_FINAL_PAUSE: string;

  @IsString()
  @IsNotEmpty()
  PARTICIPANTS_SYNC_BATCH_SIZE: string;
}

export function validateMethod(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
