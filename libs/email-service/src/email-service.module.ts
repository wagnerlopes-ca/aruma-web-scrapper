import { Module } from '@nestjs/common';
import { SESEmailService } from './ses-email-service.service';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [SESEmailService, ConfigService],
  exports: [SESEmailService],
})
export class EmailServiceModule {}
