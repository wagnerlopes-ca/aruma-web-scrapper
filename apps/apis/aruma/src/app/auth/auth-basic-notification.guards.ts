import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../../env/env-constants';
import * as crypto from 'crypto';

@Injectable()
export class AuthBasicNotificationGuard implements CanActivate {
  private readonly logger = new Logger(AuthBasicNotificationGuard.name);

  constructor(private readonly configService: ConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['basicauth'];
    const checksum = request.headers['checksum'];
    const eventKey = request.headers['eventkey'];
    const deviceName = this.getDeviceNameFromUrl(request.originalUrl);

    let authorized = false;

    if (token) { //Non PACE authentication
      authorized = this.isTokenAuthorized(token);
    } else if (checksum && eventKey) { //NEW PACE authentication
      authorized = this.isChecksumAuthorized(checksum, eventKey, deviceName);
    } else {
      this.logger.error(
        {
          message: `Webhook authentication error!`,
          notification: {
            deviceName: deviceName,
            headers: request.headers,
            body: request.body,
            token: token
          }
        }
      );

      throw new UnauthorizedException({
        success: false,
        errors: ['Unauthorized!']
      });
    }

    return authorized;
  }

  private getDeviceNameFromUrl(url: string) {
    return url.split('/').pop();
  }

  private isTokenAuthorized(token: string) {
    try {
      const secret = this.configService.get(
        EnvConstants.NOTIFICATION_BASIC_AUTH
      );
      return secret === token;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private isChecksumAuthorized(
    checksum: string,
    eventKey: string,
    deviceName: string
  ) {
    const key = `${this.configService.get(EnvConstants.NOTIFICATION_SIGNATURE)}.${this.configService.get(EnvConstants.WEBHOOK_NOTIFICATION_URL)}/${deviceName}.${eventKey}`;
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const hashKey = hash.digest('hex');

    const isAuthorized = checksum.toUpperCase() === hashKey.toUpperCase();

    if (!isAuthorized) {
      this.logger.log(
        {
          message: `Checksum failed`,
          checksumReceived: checksum.toUpperCase(),
          calculatedChecksum: hashKey.toUpperCase()
        }
      );
    }

    return isAuthorized;
  }
}
