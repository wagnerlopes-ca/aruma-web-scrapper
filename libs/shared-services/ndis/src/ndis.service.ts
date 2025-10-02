import { HttpException, Injectable, Logger, HttpStatus } from '@nestjs/common';
import { HttpStatusCode } from 'axios';
import { NDISInterface } from './ndis.interface';
import { DeviceUsersService } from './device-users/device-users.service';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../env/env.constants';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NDISService implements NDISInterface {
  private readonly logger = new Logger(NDISService.name);

  constructor(
    private readonly deviceUsersService: DeviceUsersService,
    private readonly configService: ConfigService,
  ) { }

  async sendRequest(
    method: string,
    path: string,
    extraHeaders: object,
    clientName: string,
    deviceName: string,
    requestBody: object,
    queryObject: object,
    saveTransaction: boolean
  ): Promise<Response> {
    const deviceUserDto = await this.deviceUsersService.findOne(deviceName);

    if (deviceUserDto) {
      await this.stopIfTokenExpired(deviceUserDto.Token.access_token);

      const transactionId = uuidv4();

      const response = await this.request(
        transactionId,
        deviceName,
        method,
        path,
        extraHeaders,
        deviceUserDto?.Token?.access_token,
        deviceUserDto.ClientId,
        requestBody
      );

      return response;
    } else {
      throw new HttpException(
        {
          success: false,
          result: undefined,
          errors: ['NDIA Device not found'],
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async stopIfTokenExpired(token: string) {
    const jwtService = new JwtService();
    const payload = await jwtService.decode(token);

    const now = Date.now();
    //Get the token expiry time minus 3 seconds to allow time 
    //for the request to be sent to the NDIA
    const exp = new Date((payload.exp * 1000) - 3000).getTime();

    if (now > exp) {
      this.logger.fatal(`Token expired for the device ${payload["proda.swinst"]}`);
      throw new HttpException({
        success: false,
        errors: ['The NDIA token has expired']
      }, HttpStatusCode.InternalServerError);
    }
  }

  async logResult(response: Response) {
    if (response.ok) {
      const jsonResult = await response.json();

      this.logger.log(
        `Request Success:
        Status: ${response.status}.
        Error list: ${JSON.stringify(jsonResult)}.`,
      );
    } else {
      const responseText = await response.text();

      this.logger.error(
        `Request ERROR!
            Status: ${response.status}.
            Error: ${responseText}.`,
      );
    }
  }

  async request(
    transactionId: string,
    deviceName: string,
    method: string,
    path: string,
    extraHeaders: object,
    authorizationToken: string,
    ClientId: string,
    requestBody: unknown
  ) {
    const url = `${this.configService.get(EnvConstants.NDIS_BASE_URL)}/${path}`;

    const options = this.getRequestOptions(
      method,
      extraHeaders,
      authorizationToken,
      ClientId,
      requestBody
    );

    const response = await fetch(url, options);

    let responseClone = response.clone();
    let data;

    try {
      data = await responseClone.json();
    } catch (error) {
      // Fallback to text if JSON parsing fails
      responseClone = response.clone();
      data = await responseClone.text();
    }

    const responseCode = responseClone.status;

    if(responseCode >= 500) {
      this.logger.fatal(
        {
          transactionId: transactionId,
          deviceName: deviceName,
          request: {
            url: url,
            options: options
          },
          response: data
        }
      )
    } else {
      this.logger.log(
        {
          transactionId: transactionId,
          deviceName: deviceName,
          request: {
            url: url,
            options: options
          },
          response: data
        }
      )
    }


    return response;
  }

  private isNonBillableError(responseStatus: number): boolean {
    return responseStatus >= HttpStatusCode.InternalServerError;
  }

  private getRequestOptions(
    httpMethod: string,
    extraHeaders: object,
    authorizationToken: string,
    clientId: string,
    data: unknown = null,
  ): any {
    let headers = {
      ...extraHeaders,
      'X-IBM-Client-Id': clientId,
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: authorizationToken
    }

    const requestTimeout: number = parseInt(this.configService.get(EnvConstants.REQUEST_TIMEOUT));
    let requestOptions = {
      method: httpMethod,
      headers: headers,
      signal: AbortSignal.timeout(requestTimeout),
      body: undefined
    };

    if (data != null) {
      requestOptions.body = JSON.stringify(data);
    }

    return requestOptions;
  }

  private getBaseNDISURL(apiVersion: string) {
    return `${this.configService.get(EnvConstants.NDIS_BASE_URL)}/${apiVersion}`;
  }
}