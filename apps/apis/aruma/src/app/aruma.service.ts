import {
  Injectable,
  Logger,
  HttpException
} from '@nestjs/common';
import { NDISService } from '@app/ndis';
import { PlannedOutagesService } from './planned-outages/planned-outages.service';
import { ResponseDto } from './dto/response.dto';
import { DeviceDto } from './dto/device.dto';
import { NotificationsService } from './notifications/notifications.service';
import { ConfigService } from '@nestjs/config';
import { DeviceUsersService } from './device-users/device-users.service';
import { EnvConstants } from '../../env/env-constants';
import * as path from 'path';
import { promises as fs } from 'fs';
import { format } from 'date-fns';
import { createObjectCsvWriter } from 'csv-writer';

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
    const deviceList: DeviceDto[] = JSON.parse(devicesListString);

    deviceList.forEach(deviceObject => {
      this.defaultRequest(
        url,
        method,
        body,
        headers,
        queryObject,
        deviceObject.deviceName,
        clientName,
        saveTransaction
      )
      console.log(Date.now().toLocaleString());
    });
  }

  async saveReportAsCsv(payload: any, deviceName: string): Promise<string> {
    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dateFolder = path.join(storagePath, today);
    const payloadsFolder = path.join(dateFolder, 'payloads');
    const partialCsvsFolder = path.join(dateFolder, 'partials');

    // 1. Ensure the folder exists
    await fs.mkdir(dateFolder, { recursive: true });
    await fs.mkdir(payloadsFolder, { recursive: true });
    await fs.mkdir(partialCsvsFolder, { recursive: true });

    // 2. Parse devices list from env
    const devicesListString: string =
      this.configService.get<string>('DEVICES_LIST');
    const devicesList: DeviceDto[] = JSON.parse(devicesListString || '[]');

    // 3. Determine provider based on deviceName (event_id)
    const device = devicesList.find(
      (d) => d.deviceName === deviceName
    );
    const provider = device?.provider ?? '';

    // 4. Build filename
    const timestamp = format(new Date(), 'yyyyMMddHHmmss');
    const fileName = `SBDownload_${deviceName}.csv`;
    const csvFilePath = path.join(partialCsvsFolder, fileName);

    // 5. Translate booking_type codes
    const translateBookingType = (code: string) => {
      switch (code) {
        case 'ZSAG':
          return 'Standard Booking';
        case 'ZPLM':
          return 'Plan Managed';
        default:
          return code;
      }
    };

    // 6. Extract data rows from payload
    const rows = (payload.response?.report_data || []).map((r: any) => ({
      participant_name: r.participant_name,
      participant: r.participant,
      booking_type: translateBookingType(r.booking_type),
      service_booking_id: r.service_booking_id,
      initiated_by: r.initiated_by,
      product_category: r.product_category,
      product_category_item: r.product_category_item,
      quantity: r.quantity,
      start_date: r.start_date,
      end_date: r.end_date,
      allocated_amount: r.allocated_amount,
      remaining_amount: r.remaining_amount,
      accrual_amount: r.accrual_amount,
      last_modified_date: r.last_modified_date,
      virtual_status: r.virtual_status,
      provider: provider,
      status: r.status,
    }));

    // 7. Write the JSON copy (optional)
    const jsonFilePath = path.join(payloadsFolder, `${payload.event_id}_${deviceName}_${timestamp}.json`);
    await fs.writeFile(jsonFilePath, JSON.stringify(payload, null, 2), 'utf-8');

    // 8. Define CSV writer (headers must match CSV order)
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'participant_name', title: 'participant_name' },
        { id: 'participant', title: 'participant' },
        { id: 'booking_type', title: 'booking_type' },
        { id: 'service_booking_id', title: 'service_booking_id' },
        { id: 'initiated_by', title: 'initiated_by' },
        { id: 'product_category', title: 'product_category' },
        { id: 'product_category_item', title: 'product_category_item' },
        { id: 'quantity', title: 'quantity' },
        { id: 'start_date', title: 'start_date' },
        { id: 'end_date', title: 'end_date' },
        { id: 'allocated_amount', title: 'allocated_amount' },
        { id: 'remaining_amount', title: 'remaining_amount' },
        { id: 'accrual_amount', title: 'accrual_amount' },
        { id: 'last_modified_date', title: 'last_modified_date' },
        { id: 'virtual_status', title: 'virtual_status' },
        { id: 'provider', title: 'provider' },
        { id: 'status', title: 'status' },
      ],
    });

    // 9. Write CSV
    await csvWriter.writeRecords(rows);

    console.log(`✅ CSV and JSON saved in ${dateFolder}`);

    this.combineCsvsIfReady(devicesList);

    return csvFilePath;
  }

  async combineCsvsIfReady(devicesList: DeviceDto[]): Promise<string | null> {
    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const resultsFolder = path.join(storagePath, today, 'results');
    const partialsFolder = path.join(storagePath, today, 'partials');

    const lockPath = path.join(resultsFolder, '.combining.lock');

    // Try to acquire lock
    try {
      await fs.open(lockPath, 'wx'); // fail if exists
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        console.log('⚠️ Combination already in progress, skipping...');
        return null;
      }
      throw err;
    }

    try {
      // List all CSV files in results folder
      const allFiles = await fs.readdir(partialsFolder);
      const csvFiles = allFiles.filter((f) => f.endsWith('.csv') && f.startsWith('SBDownload_'));

      // Check if all devices have reported
      const missingDevices = devicesList.filter(
        (d: DeviceDto) => !csvFiles.some((f) => f.includes(d.deviceName))
      );

      if (missingDevices.length > 0) {
        console.log(`⏳ Waiting for devices: ${missingDevices.join(', ')}`);
        return null;
      }

      // Read CSVs and combine
      const combinedLines: string[] = [];
      for (let i = 0; i < csvFiles.length; i++) {
        const csvPath = path.join(partialsFolder, csvFiles[i]);
        const content = await fs.readFile(csvPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

        if (i === 0) {
          // Keep header from first file
          combinedLines.push(...lines);
        } else {
          // Skip header
          combinedLines.push(...lines.slice(1));
        }
      }

      // Write final combined CSV
      const timestamp = format(new Date(), 'yyyyMMddHHmmss');
      const finalCsvName = `SBDownload_${timestamp}.csv`;
      const finalCsvPath = path.join(resultsFolder, finalCsvName);

      await fs.writeFile(finalCsvPath, combinedLines.join('\n'), 'utf-8');

      console.log(`✅ Combined CSV created: ${finalCsvPath}`);
      return finalCsvPath;
    } finally {
      // Release lock
      await fs.unlink(lockPath).catch(() => { });
    }
  }
}