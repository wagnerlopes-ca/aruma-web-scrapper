import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FieldCryptoService } from './field-crypto.service';

@Module({
  imports: [ConfigModule],
  providers: [FieldCryptoService],
  exports: [FieldCryptoService],
})
export class FieldCryptoModule {}
