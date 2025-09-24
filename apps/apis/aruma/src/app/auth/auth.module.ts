import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DeviceUsersModule } from '../device-users/device-users.module';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DeviceUsersService } from '../device-users/device-users.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../../env/env-constants';

@Module({
  imports: [
    DeviceUsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get(EnvConstants.AUTH_BEARER_SECRET),
        signOptions: {
          expiresIn: configService.get(
            EnvConstants.AUTH_BEARER_EXPIRES_IN_TIME_TOKEN_BEARER,
          ),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtService, DeviceUsersService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
