import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../../env/env-constants';

@Injectable()
export class AuthBasicGuard implements CanActivate {
  private readonly logger = new Logger(AuthBasicGuard.name);

  constructor(private readonly configService: ConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['basicauth'];
    const deviceName = this.getDeviceNameFromUrl(request.originalUrl);

    let authorized = false;

    if (token) { //Non PACE authentication
      authorized = this.isTokenAuthorized(token);
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
        EnvConstants.BASIC_AUTH
      );
      return secret === token;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
