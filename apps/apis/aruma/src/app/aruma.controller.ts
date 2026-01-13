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
import { ArumaService } from './aruma.service';

@Controller()
@ApiTags('Aruma')
export class ArumaController {
  private readonly logger = new Logger(ArumaController.name);

  constructor(
    private readonly arumaService: ArumaService,
  ) { }

  @Get('health-check')
  @HttpCode(204)
  healthCheck() {
    console.log('Test');
    return 'Working';
  }

  //Phase 1: Request SB_REPORT
  @UseGuards(AuthBearerGuard)
  @Post('/request-reports')
  async requestReports() {
    this.arumaService.requestReports();
  }

  //Phase 2: 
  //   Receives notification from the NDIS,
  //   request remaining data and
  //   generate partial files
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
      this.arumaService.processSbReportNotification(body, deviceName);
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

  //Phase 3: Create final CSV files and upload
  @UseGuards(AuthBearerGuard)
  @Post('/finalise')
  async finalise() {
    this.arumaService.createResultFilesAndUpload();
  }

  //Phase 3: Create final CSV files and upload
  @UseGuards(AuthBearerGuard)
  @Post('/finops')
  async finops(@Body() body) {
    this.arumaService.postPaymentsBatchFile(body.FileName);
  }
}
