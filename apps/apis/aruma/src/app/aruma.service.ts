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
import { EnvConstants } from '../../env/env-constants';

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

  public async stopIfOutage() {
    return this.plannedOutagesService.stopIfOutage();
  }

  private isBlank(value: unknown): boolean {
    return value === null || value === undefined || value === '';
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

      const response = await this.sendRequest(
        method,
        url,
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

        return {
          success: false,
          result: undefined,
          errors: errorList,
        };
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
      }
    }
  }

  async formatError(error) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      let errorList;

      if (typeof response === 'string') {
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

  async initWebScrapper() {
    const url = '3.0/notifications/report';
    const method = 'POST';
    const body = { event_id: "SB_REPORT" }
    const headers = null;
    const queryObject = null;
    const clientName = "Aruma";
    const saveTransaction = false;

    const devicesListString: string = this.configService.get(EnvConstants.DEVICES_LIST);
    const deviceList: string[] = JSON.parse(devicesListString);

    deviceList.forEach(deviceName => {
     this.defaultRequest(
        url,
        method,
        body,
        headers,
        queryObject,
        deviceName,
        clientName,
        saveTransaction
      )
    });
  }
}