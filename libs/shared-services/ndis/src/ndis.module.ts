import { Module } from '@nestjs/common';
import { NDISService } from './ndis.service';
import { DeviceUsersModule } from './device-users/device-users.module';
import { DeviceUsersService } from './device-users/device-users.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateMethod } from '../env/env.validation';

@Module({
  imports: [
    DeviceUsersModule,
    ConfigModule.forRoot({
      validate: validateMethod,
    }),
  ],
  providers: [NDISService, ConfigService, DeviceUsersService],
  exports: [NDISService, DeviceUsersService],
})
export class NDISModule {}
