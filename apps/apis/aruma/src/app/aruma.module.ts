import { Module } from '@nestjs/common';
import { NDISModule, NDISService } from '@app/ndis';

import { DeviceUsersService } from './device-users/device-users.service';
import { PlannedOutagesModule } from './planned-outages/planned-outages.module';
import { PlannedOutagesService } from './planned-outages/planned-outages.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthModule } from './auth/auth.module';
import { DeviceUsersModule } from './device-users/device-users.module';
import { NotificationsService } from './notifications/notifications.service';
import { EmailServiceModule } from '@app/email-service';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { ArumaController } from './aruma.controller';
import { ArumaService } from './aruma.service';
import { validateMethod } from '../../env/env.validation';
import { ScheduleModule } from '@nestjs/schedule';
import { BatchInitiatorService } from './batch-initiator.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: validateMethod,
    }),
    PlannedOutagesModule,
    NDISModule,
    AuthModule,
    DeviceUsersModule,
    EmailServiceModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async () => {
        return {
          pinoHttp: {
            level: 'info', // Or any other config value
            genReqId: () => uuidv4(),
            quietReqLogger: true,
            timestamp: false,
            singleLine: true,
            autoLogging: false,
            base: undefined,
            formatters: {
              level: (label) => {
                return { level: label.toUpperCase() };
              },
            },
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [AuthController, ArumaController],
  providers: [
    NDISService,
    PlannedOutagesService,
    ArumaService,
    AuthService,
    DeviceUsersService,
    NotificationsService,
    BatchInitiatorService
  ],
  exports: [],
})
export class ArumaModule {}
