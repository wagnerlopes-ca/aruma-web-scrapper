import { Module } from '@nestjs/common';
import { NDISService } from './ndis.service';
import { DeviceUsersModule } from './device-users/device-users.module';
import { DeviceUsersService } from './device-users/device-users.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DeviceUsersModule,
  ],
  providers: [NDISService, ConfigService, DeviceUsersService],
  exports: [NDISService, DeviceUsersService],
})
export class NDISModule {}
