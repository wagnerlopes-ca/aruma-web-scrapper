/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { INestApplication, LogLevel, VersioningType } from '@nestjs/common';
import bodyParser from 'body-parser';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ArumaModule } from './app/aruma.module';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../env/env-constants';

async function bootstrap() {
  const app = await NestFactory.create(ArumaModule, {
    logger: [],
    bufferLogs: true,
  });

  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

  const globalPrefix = 'aruma';
  const configService = app.get(ConfigService);
  const apiVersion = configService.get(EnvConstants.API_VERSION);
  const envLogLevels = configService.get(EnvConstants.LOG_LEVELS);

  const logLevels = configureLogLevels(envLogLevels);

  app.useLogger(logLevels);

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });
  app.setGlobalPrefix(globalPrefix);
  app.useLogger(app.get(Logger));
  await buildSwagger(app, apiVersion);

  const port = configService.get(EnvConstants.PORT) || 3000;
  await app.listen(port);
  const logger = app.get(Logger); // Get the pino logger

  logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  logger.log(
    `🚀 Application Docs is here: http://localhost:${port}/${globalPrefix}/v${apiVersion}/docs`,
  );
}

async function buildSwagger(app: INestApplication, apiVersion: string) {
  const config = new DocumentBuilder()
    .setTitle('Care Access API')
    .setDescription('API used for Care Access')
    .setVersion('v' + apiVersion)
    .addTag('NDIA Middleware')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`aruma/:version/docs`, app, document);
}

bootstrap();
function configureLogLevels(envLogLevels: string): LogLevel[] {
  let logLevels: LogLevel[] = [];

  // Check if LOG_LEVELS is defined and split it into an array
  if (envLogLevels) {
    logLevels = envLogLevels.split(',') as LogLevel[];
  }
  return logLevels;
}
