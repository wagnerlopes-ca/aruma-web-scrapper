import { Injectable } from '@nestjs/common';
import {
  SequelizeModuleOptions,
  SequelizeOptionsFactory,
} from '@nestjs/sequelize';
import { DeviceUsers } from './entities/device-users.entity';
import { PlannedOutages } from './entities/planned-outages.entity';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../env/env.constants';

@Injectable()
export class DatabaseConfigService implements SequelizeOptionsFactory {
  constructor(private configService: ConfigService) {}

  createSequelizeOptions(): SequelizeModuleOptions {
    return {
      dialect: 'mysql',
      host: this.configService.get(EnvConstants.DATABASE_SERVER),
      port: this.configService.get(EnvConstants.DATABASE_PORT),
      username: this.configService.get(EnvConstants.DATABASE_USERNAME),
      password: this.configService.get(EnvConstants.DATABASE_PASSWORD),
      database: this.configService.get(EnvConstants.DATABASE_NAME),
      logging: false,
      models: [DeviceUsers, PlannedOutages],
      pool: {
        min: 3,
        max: 10,
      },
    };
  }
}
