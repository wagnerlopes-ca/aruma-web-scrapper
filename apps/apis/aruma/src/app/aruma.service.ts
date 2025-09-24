import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { NDISService } from '@app/ndis';
import { PlannedOutagesService } from './planned-outages/planned-outages.service';
import { ResponseDto } from './dto/response.dto';
import { NotificationsService } from './notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { DeviceUsersService } from './device-users/device-users.service';

const BASE_URL = '/aruma/v1/';

@Injectable()
export class ArumaService {
  private readonly logger = new Logger(ArumaService.name);

  constructor(
    private readonly ndisService: NDISService,
    private readonly plannedOutagesService: PlannedOutagesService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly deviceUserService: DeviceUsersService
  ) { }

  public async subscribeToNotification(
    request: Request,
    deviceName: string,
    clientName: string,
    eventId: string,
    frequency: string
  ) {
    const body = await this.notificationsService.getNotificationSubscriptionBody(
      eventId,
      frequency,
      deviceName
    );

    const requestUrl = request.url.replace('-all', '');

    const headers = { ...request.headers };

    const result = await this.defaultRequest(
      requestUrl,
      request.method,
      body,
      headers,
      null,
      deviceName,
      clientName,
      true
    );

    return result;
  }

  public async stopIfOutage() {
    return this.plannedOutagesService.stopIfOutage();
  }

  private isBlank(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  public async stopIfClientWebhookNotConfigured(deviceName: string) {
    const deviceUser = await this.deviceUserService.findOne(deviceName);

    if (this.isBlank(deviceUser.WebhookUrl) || this.isBlank(deviceUser.WebhookBasicAuth)) {
      const errorPayload = {
        success: false,
        errors: [
          `Client webhook not configured for device: ${deviceName}`,
          `Configure your webhook using POST /notifications/webhook before subscribing to notifications.`
        ]
      }
      this.logger.error(errorPayload);

      throw new HttpException(
        errorPayload,
        422
      );
    }
  }

  public async sendRequest(
    method: string,
    path: string,
    extraHeaders: object,
    requestBody: object,
    deviceName: string,
    clientName: string,
    queryObject: object,
    saveTransaction: boolean
  ): Promise<Response> {
    this.logger.log({
      message: `Request received!`,
      requestElements: {
        method,
        path,
        extraHeaders,
        requestBody,
        deviceName,
        clientName,
        queryObject
      }
    });

    return await this.ndisService.sendRequest(
      method,
      path,
      extraHeaders,
      clientName,
      deviceName,
      requestBody,
      queryObject,
      saveTransaction
    );
  }

  public async defaultRequest(
    url: string,
    method: string,
    body: object,
    headers: object,
    queryObject: object,
    deviceName: string,
    clientName: string,
    saveTransaction: boolean
  ): Promise<ResponseDto> {
    try {
      //This method will throw an exception in case of outage
      //and stop the request
      await this.stopIfOutage();

      const requestUrl = url.replace(BASE_URL, '');

      //Removing undesired headers
      delete headers['host'];
      delete headers['user-agent'];
      delete headers['content-length'];
      delete headers['x-forwarded-for'];
      delete headers['x-forwarded-proto'];
      delete headers['x-forwarded-port'];

      const response = await this.sendRequest(
        method,
        requestUrl,
        headers,
        body,
        deviceName,
        clientName,
        queryObject,
        saveTransaction
      );

      if (!response.ok) {
        const responseClone = response.clone();
        let errorList;

        try {
          errorList = await responseClone.json();
        } catch (e) {
          errorList = await response.text();
        }

        throw new HttpException(errorList, response.status);
      }

      const result = await response.json();

      const responseDto = {
        success: result.success,
        result: result.result,
        errors: undefined,
      };

      return responseDto;
    } catch (error) {
      this.logger.error(error);

      const formattedError = await this.formatError(error);

      if (error instanceof HttpException) {
        throw new HttpException(
          formattedError,
          error.getStatus(),
        );
      } else {
        this.logger.fatal(
          {
            message: error.message || 'Fatal error in NDIA Middleware',
            exceptionType: error.constructor.name,
            errors: [error],
            request: {
              url,
              method,
              body,
              headers,
              queryObject,
              deviceName,
              clientName
            }
          }
        );

        throw new HttpException(
          formattedError,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async formatError(error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      let errorList;

      if(typeof response === 'string') {
        try {
          errorList = await JSON.parse(response);
        } catch (e) {
          errorList = response;
        }
      } else if (response['errors']) {
        errorList = response['errors']
      } else {
        errorList = response;
      }

      if (Array.isArray(errorList)) {
        return {
          success: false,
          result: undefined,
          errors: errorList,
        }
      } else {
        return {
          success: false,
          result: undefined,
          errors: [errorList],
        }
      }
    } else {
      if (error.message) {
        return {
          success: false,
          result: undefined,
          errors: [error.message],
        }
      } else {
        return {
          success: false,
          result: undefined,
          errors: ['Unknown error returned by the NDIA'],
        }
      }
    }
  }
}