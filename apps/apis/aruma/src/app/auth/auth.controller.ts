import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Request,
  Get,
  UseGuards,
  Logger,
  BadRequestException
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestSignInDto } from './dto/request-sign-in.dto';
import { AuthBearerGuard } from './auth-bearer.guards';

@Controller('auth')
export class AuthController {

  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) { }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: RequestSignInDto) {
    if (
      !signInDto ||
      !signInDto.device_name ||
      !signInDto.password
    ) {
      const error = {
        success: false,
        errors: [
          'Incorrect parameters for login.'
        ]
      }
      
      this.logger.warn(error, signInDto);
      throw new BadRequestException(error);
    }
    return this.authService.signIn(signInDto.device_name, signInDto.password);
  }

  @UseGuards(AuthBearerGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}