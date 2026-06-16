import { Module } from '@nestjs/common';
import { DatabaseConfigService } from './database.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DatabaseConfigService,
    }),
  ],
  providers: [DatabaseConfigService],
})
export class DatabaseModule {}
