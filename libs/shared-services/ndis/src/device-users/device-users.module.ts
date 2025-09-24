import { Module } from '@nestjs/common';
import { DeviceUsersService } from './device-users.service';
import { DeviceUsersProviders } from './device-users.providers';
import { DatabaseModule } from '../../../../database/src/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [DeviceUsersService, ...DeviceUsersProviders],
  exports: [...DeviceUsersProviders, DeviceUsersService],
})
export class DeviceUsersModule {}
