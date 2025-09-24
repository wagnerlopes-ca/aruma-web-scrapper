import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from 'apps/apis/aruma/env/env-constants';

@Injectable()
export class AuthBearerGuard implements CanActivate {
  private readonly logger = new Logger(AuthBearerGuard.name);
  constructor(
    private jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        success: false,
        errors: ['Unauthorized'],
      });
    }
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get(EnvConstants.AUTH_BEARER_SECRET),
        ignoreExpiration: true, //TODO: Validate this risk once a previous token, together with your device, will continue to work. Or key for the signature must be exchanged once the token no longer expires by date.
      });
      request['user'] = payload;
    } catch {
      throw new UnauthorizedException({
        success: false,
        errors: ['Unauthorized'],
      });
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
