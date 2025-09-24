import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DeviceUsersService } from '../device-users/device-users.service';
import { JwtService } from '@nestjs/jwt';
import { ResponseSignInDto } from './dto/response-sign-in.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private deviceUsersService: DeviceUsersService,
    private jwtService: JwtService,
  ) { }

  async signIn(
    deviceName: string,
    password: string,
  ): Promise<ResponseSignInDto> {
    const deviceUser = await this.deviceUsersService.findOne(deviceName);

    const result = {
      success: false
    } as ResponseSignInDto;

    if (!deviceUser || deviceUser.Password !== password) {
      result.errors = ['Invalid device name or password!'];
      throw new UnauthorizedException(result);
    } else {
      const payload = { 
        sub: deviceUser.DeviceName 
      };

      if(deviceUser.ClientName) {
        payload['client'] = deviceUser.ClientName;
      }

      const accessToken = await this.jwtService.signAsync(payload)

      result.success = true;
      result.result = {
        access_token: accessToken,
      }

      return result;
    }
  }
}
