import {
  Controller,
  Get,
  Post,
  HttpCode,
  Logger,
  Body,
  UseGuards,
  Req,
  Param
} from '@nestjs/common';

import { ApiTags } from '@nestjs/swagger';
import { RequestDto } from './dto/request.dto';
import { AuthBearerGuard } from './auth/auth-bearer.guards';
import { AuthBasicNotificationGuard } from './auth/auth-basic-notification.guards';
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

  //Receives notification from the NDIS
  @UseGuards(AuthBasicNotificationGuard)
  @Post('/weebhook/notification/:deviceName')
  async notificationsWebhook(
    @Body() body: RequestDto,
    @Req() request: Request,
    @Param() params: unknown,
  ) {
    const eventId = request.headers['event_id'] || request.headers['eventid'];
    const deviceName = params['deviceName'];

    if (eventId === 'SB_REPORT' && deviceName != null) {
      this.arumaService.processSbReportNotifications(body, deviceName);
    }

    this.logger.log(
      {
        message: `Weebhook notification for ${params['deviceName']} was received.`,
        notificationPayload: body,
        headers: request.headers
      }
    );

    return {
      success: true,
      result: "Notification received!"
    };
  }

  @UseGuards(AuthBearerGuard)
  @Post('/')
  async init() {
    this.arumaService.initWebScrapper();
  }
}
