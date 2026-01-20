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

    this.arumaService.processNotification(body, deviceName, eventId);

    //Create a new method in ArumaService to check the report type and handle them as required
    // Expected notifications:
    // Web Scrapper: SB_REPORT
    // Finops: BULK_PROCESS_FINISH, BULK_CLAIM_REPORT, REMIT_ADV_GENERATED (These )

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

  //Finops: GET payments batch
  @UseGuards(AuthBearerGuard)
  @Get('/payments/batch')
  async getPaymentsBatch() {
    return this.arumaService.getAllBatches();
  }

  //Finops: POST payments batch
  @UseGuards(AuthBearerGuard)
  @Post('/payments/batch')
  async postPaymentsBatch(@Body() body) {
    this.arumaService.postPaymentsBatchFile(body.FileName);

    return {
      success: true,
      result: 'Batch payment process started'
    }
  }

  //Finops: Claim Nudge
  @UseGuards(AuthBearerGuard)
  @Post('/payments/nudge')
  async postPaymentsNudge() {
    return await this.arumaService.postPaymentsNudge();
  }
}
