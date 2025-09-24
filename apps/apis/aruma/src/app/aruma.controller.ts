import {
  Controller,
  Get,
  Post,
  HttpCode,
  Logger,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';

import { ApiTags } from '@nestjs/swagger';
import { RequestDto } from './dto/request.dto';
import { AuthBearerGuard } from './auth/auth-bearer.guards';
import { NotificationsService } from './notifications/notifications.service';
import { ArumaService } from './aruma.service';
import { ConfigService } from '@nestjs/config';

@Controller()
@ApiTags('Aruma')
export class ArumaController {
  private readonly logger = new Logger(ArumaController.name);

  constructor(
    private readonly arumaService: ArumaService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService
  ) { }

  @Get('health-check')
  @HttpCode(204)
  healthCheck() {
    console.log('Test');
    return 'Working';
  }

  @UseGuards(AuthBearerGuard)
  @Post('/')
  async post(@Body() body: RequestDto, @Req() request: Request) {
    console.log('Test');
    return { success: true }
  }
}
