import { Module } from '@nestjs/common';
import { DatabaseConfigService } from './database.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { validateMethod } from '../env/env.validation';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [
        ConfigModule.forRoot({
          validate: validateMethod,
        }),
      ],
      useClass: DatabaseConfigService,
    }),
  ],
  providers: [DatabaseConfigService, ConfigService],
})
export class DatabaseModule {}
