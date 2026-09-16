import { Module } from '@nestjs/common';
import { DeviceUsersService } from './device-users.service';
import { DeviceUsersProviders } from './device-users.providers';
import { DatabaseModule } from '../../../../database/src/database.module';
import { FieldCryptoModule } from '@app/database/crypto/field-crypto.module';

@Module({
  imports: [DatabaseModule, FieldCryptoModule],
  providers: [DeviceUsersService, ...DeviceUsersProviders],
  exports: [...DeviceUsersProviders, DeviceUsersService, FieldCryptoModule],
})
export class DeviceUsersModule {}
