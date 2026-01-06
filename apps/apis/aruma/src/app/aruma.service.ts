import {
  Injectable,
  Logger,
  HttpException
} from '@nestjs/common';
import { NDISService } from '@app/ndis';
import { PlannedOutagesService } from './planned-outages/planned-outages.service';
import { ResponseDto } from './dto/response.dto';
import { DeviceDto } from './dto/device.dto';
import { ConfigService } from '@nestjs/config';
import { DeviceUsersService } from './device-users/device-users.service';
import { EnvConstants } from '../../env/env-constants';
import * as path from 'path';
import { promises as fs } from 'fs';
import { format } from 'date-fns';
import { createObjectCsvWriter } from 'csv-writer';
import csvParser from 'csv-parser';
import { DeviceUsersDto } from './device-users/dto/device-users.dto';
import { JwtService } from '@nestjs/jwt';
//import { CsvUploaderService } from './csv-uploader/csv-uploader.service';
import Client from 'ssh2-sftp-client';
import { Transform } from 'stream';

@Injectable()
export class ArumaService {
  private readonly logger = new Logger(ArumaService.name);

  private readonly SB_DOWNLOAD_PREFIX = 'SBDownload';
  private readonly SERVICE_BOOKING_LIST_PREFIX = 'ServiceBookingList';
  private readonly SERVICE_BOOKING_DETAILS_PREFIX = 'ServiceBookingDetails';
  private readonly SUPPORT_DETAILS_PREFIX = 'SupportDetails';

  constructor(
    private readonly ndisService: NDISService,
    private readonly plannedOutagesService: PlannedOutagesService,
    private readonly configService: ConfigService,
    private readonly deviceUserService: DeviceUsersService
  ) { }

  public async stopIfOutage() {
    return this.plannedOutagesService.stopIfOutage();
  }

  public async sendRequest(
    method: string,
    path: string,
    extraHeaders: object,
    requestBody: object,
    deviceName: string,
    clientName: string,
    queryObject: object,
    saveTransaction: boolean,
    deviceUser: DeviceUsersDto
  ): Promise<Response> {
    return await this.ndisService.sendRequest(
      method,
      path,
      extraHeaders,
      deviceName,
      requestBody,
      deviceUser
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
    saveTransaction: boolean,
    deviceUser: DeviceUsersDto
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
        saveTransaction,
        deviceUser
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

  public async csvToBulkPaymentPayloads(
    csvString: string,
    maxItemsPerRequest: number = 5000
  ): Promise<Array<{ bulk_payment_request: any[] }>> {
    const rows: any[] = [];

    // Parse CSV string into rows
    await new Promise<void>((resolve, reject) => {
      const parser = csvParser({
        mapHeaders: ({ header }) => header.trim(), // clean headers
      });

      const stringStream = new Transform({
        writableObjectMode: true,
        transform(chunk, encoding, callback) {
          this.push(chunk);
          callback();
        },
      });

      stringStream.end(csvString);

      stringStream
        .pipe(parser)
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    // Transform rows into the desired payload format
    const items = rows.map((row) => {
      const participant = row.NDISNUMBER ? Number(row.NDISNUMBER) : null;
      const quantity = row.QUANTITY ? parseFloat(row.QUANTITY.replace(',', '.')) : 0;

      return {
        participant: participant,
        start_date: row.SUPPORTSDELIVEREDFROM,
        end_date: row.SUPPORTSDELIVEREDTO,
        product_category_item: row.SUPPORTNUMBER,
        ref_doc_no: row.CLAIMREFERENCE,
        quantity: quantity,
        unit_price: parseFloat(row.UNITPRICE),
        tax_code: row.GSTCODE || '',
        authorised_by: row.AUTHORISEDBY || '',
        participant_approved: participant, // assuming same as NDISNUMBER when approved
        inkind_flag: row.PARTICIPANTAPPROVED === 'True',
        claim_type: row.CLAIMTYPE || '',
        claim_reason: row.CANCELLATIONREASON || '',
        abn_provider: row.ABNOFSUPPORTPROVIDER ? Number(row.ABNOFSUPPORTPROVIDER) : null,
        abn_not_available: false,
        exemption_reason: 'null', // as per your example
      };
    });

    // Chunk into arrays of maxItemsPerRequest
    const chunks: Array<{ bulk_payment_request: any[] }> = [];
    for (let i = 0; i < items.length; i += maxItemsPerRequest) {
      const chunk = items.slice(i, i + maxItemsPerRequest);
      chunks.push({
        bulk_payment_request: chunk,
      });
    }

    return chunks;
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

  async requestReports() {
    try {
      const url = '3.0/notifications/report';
      const method = 'POST';
      const body = { event_id: "SB_REPORT" }
      const headers = null;
      const queryObject = null;
      const clientName = "Aruma";
      const saveTransaction = false;

      const devicesListString: string = this.configService.get(EnvConstants.DEVICES_LIST);
      const deviceList: DeviceDto[] = JSON.parse(devicesListString);

      this.logger.log({
        devicesListString: devicesListString,
        deviceList: deviceList
      });

      deviceList.forEach(async deviceObject => {
        try {
          const deviceUser = await this.deviceUserService.findOne(deviceObject.deviceName);

          this.defaultRequest(
            url,
            method,
            body,
            headers,
            queryObject,
            deviceObject.deviceName,
            clientName,
            saveTransaction,
            deviceUser
          );
        } catch (exception) {
          this.logger.fatal(exception);
        }
      });
    } catch (exception) {
      this.logger.fatal(exception);
    }
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveSBReport(deviceName: string, payloadsFolder: string, sbReportPayload: any) {
    const jsonFilePath = path.join(payloadsFolder, `${sbReportPayload.event_id}_${deviceName}.json`);
    await fs.writeFile(jsonFilePath, JSON.stringify(sbReportPayload, null, 2), 'utf-8');

    this.logger.log(`✅ SB_REPORT saved in ${jsonFilePath}`);
  }

  async saveSBDownloadPartial(deviceName: string, partialCsvsFolder: string, sbReportPayload: any, provider: string) {
    // 1. Build filename
    const fileName = `SBDownload_${deviceName}.csv`;
    const csvFilePath = path.join(partialCsvsFolder, fileName);

    // 2. Extract data rows from payload
    const rows = (sbReportPayload.response?.report_data || []).map((r: any) => ({
      participant_name: r.participant_name,
      participant: r.participant,
      booking_type: this.translateBookingType(r.booking_type),
      service_booking_id: r.service_booking_id,
      initiated_by: r.initiated_by,
      product_category: r.product_category,
      product_category_item: r.product_category_item,
      quantity: r.quantity,
      start_date: r.start_date + ' 00:00:00.000',
      end_date: r.end_date + ' 00:00:00.000',
      allocated_amount: r.allocated_amount,
      remaining_amount: r.remaining_amount,
      accrual_amount: r.accrual_amount,
      last_modified_date: r.last_modified_date + ' 00:00:00.000',
      virtual_status: r.virtual_status,
      provider: provider,
      status: r.status,
    }));

    // 3. Define CSV writer (headers must match CSV order)
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
      alwaysQuote: true,
      recordDelimiter: '\r\n'
    });

    // 4. Write CSV
    await csvWriter.writeRecords(rows);

    console.log(`✅ CSV saved in ${csvFilePath}`);
  }

  async processSbReportNotification(sbReportPayload: any, deviceName: string): Promise<string> {
    try {
      const storagePath = this.configService.get<string>('STORAGE_PATH');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dateFolder = path.join(storagePath, today);
      const resultsFolder = path.join(dateFolder, 'results');
      const payloadsFolder = path.join(dateFolder, 'payloads');
      const partialCsvsFolder = path.join(dateFolder, 'partials');

      // 1. Ensure the folder exists
      await fs.mkdir(dateFolder, { recursive: true });
      await fs.mkdir(resultsFolder, { recursive: true });
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

      const deviceUser = await this.deviceUserService.findOne(deviceName);

      // 4. Save Files
      await this.saveSBReport(deviceName, payloadsFolder, sbReportPayload);

      //5. Generate partial CSV files
      await this.saveSBDownloadPartial(deviceName, partialCsvsFolder, sbReportPayload, provider);
      await this.generateServiceBookingsListPartial(device.deviceName, device.portal, sbReportPayload, deviceUser);
      await this.generateServiceBookingDetailsAndSupportDetailsPartials(device.deviceName, device.portal, sbReportPayload, deviceUser);
    } catch (exception) {
      this.logger.fatal(exception);
    }

    return null;
  }

  async generateResultFiles(prefix: string): Promise<string | null> {
    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const resultsFolder = path.join(storagePath, today, 'results');
    const partialsFolder = path.join(storagePath, today, 'partials');

    await fs.mkdir(resultsFolder, { recursive: true });

    try {
      const allFiles = await fs.readdir(partialsFolder);
      const csvFiles = allFiles.filter((f) => f.endsWith('.csv') && f.startsWith(prefix));

      console.log(`📂 Combining ${csvFiles.length} CSVs for prefix "${prefix}"...`);

      const combinedLines: string[] = [];
      for (let i = 0; i < csvFiles.length; i++) {
        const csvPath = path.join(partialsFolder, csvFiles[i]);

        try {
          const content = await fs.readFile(csvPath, 'utf-8');
          const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
          if (lines.length <= 1) {
            console.warn(`⚠️ Skipping empty or invalid CSV: ${csvFiles[i]}`);
            continue;
          }

          if (i === 0) {
            combinedLines.push(...lines);
          } else {
            combinedLines.push(...lines.slice(1)); // skip header
          }
        } catch (err: any) {
          console.error(`❌ Error reading ${csvFiles[i]}: ${err.message}`);
          continue;
        }
      }

      if (combinedLines.length === 0) {
        console.warn(`⚠️ No valid CSV data to combine for ${prefix}.`);
        return null;
      }

      const timestamp = format(new Date(), 'yyyyMMddHHmmss');
      const finalCsvName = `${prefix}_${timestamp}.csv`;
      const finalCsvPath = path.join(resultsFolder, finalCsvName);

      await fs.writeFile(finalCsvPath, combinedLines.join('\r\n'), 'utf-8');

      console.log(`✅ Combined CSV created: ${finalCsvPath}`);
      return finalCsvPath;
    } catch (exception) {
      this.logger.error(exception);
    }
  }

  async generateServiceBookingsListPartial(
    deviceName: string,
    portal: string,
    sbReportPayload: any,
    deviceUser: DeviceUsersDto
  ): Promise<void> {
    this.logger.log(`Processing SB_REPORT for ${deviceName} (${portal})...`);

    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dateFolder = path.join(storagePath, today);
    const partialsFolder = path.join(dateFolder, 'partials');

    // 1️⃣ Extract unique participants
    const participantsMap: Record<string, string> = {};
    for (const record of sbReportPayload?.response?.report_data || []) {
      if (record.participant && record.participant_name) {
        participantsMap[record.participant] = record.participant_name;
      }
    }

    const participants = Object.entries(participantsMap).map(([participant, participant_name]) => ({
      participant,
      participant_name,
    }));

    this.logger.log(`Found ${participants.length} unique participants for ${deviceName}.`);

    // 2️⃣ Fetch service bookings (using defaultRequest, throttled at 500ms)
    const allBookings: any[] = [];

    for (const { participant } of participants) {
      try {
        const localDeviceUser: DeviceUsersDto = await this.refreshDeviceUserIfTokenExpired(deviceUser);

        const url = '4.0/service-bookings';
        const method = 'GET';
        const body = null;
        const headers = { participant };
        const queryObject = null;
        const clientName = 'Aruma';
        const saveTransaction = false;

        const response = await this.defaultRequest(
          url,
          method,
          body,
          headers,
          queryObject,
          deviceName,
          clientName,
          saveTransaction,
          localDeviceUser
        );

        if (response?.success && Array.isArray(response.result) && response.result.length > 0) {
          const dateExtracted = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
          const translatedRows = response.result.map((result: any) => ({
            date_last_extracted: dateExtracted,
            Portal: portal,
            service_booking_id: result.service_booking_id,
            booking_type: this.translateBookingType(result.booking_type),
            participant_name: `${result.participant_name} (${result.participant})`,
            start_date: this.formatDate(result.start_date),
            end_date: this.formatDate(result.end_date),
            last_modified_date: this.formatDate(result.submitted_date),
            created_by: result.created_by,
            status: result.status,
            virtual_status: result.virtual_status,
          }));

          allBookings.push(...translatedRows);
        } else {
          this.logger.warn(`No service bookings found for participant ${participant}`);
        }
      } catch (err) {
        this.logger.error(`Error fetching service bookings for ${participant}: ${err.message}`);
      }

      // Throttle: wait 500 ms before next participant
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3️⃣ Write partial CSV
    if (allBookings.length === 0) {
      this.logger.warn(`No service bookings collected for ${deviceName}.`);
      return;
    }

    const csvPath = path.join(partialsFolder, `ServiceBookingList_${deviceName}.csv`);
    const csvWriter = createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'date_last_extracted', title: 'date_last_extracted' },
        { id: 'Portal', title: 'Portal' },
        { id: 'service_booking_id', title: 'service_booking_id' },
        { id: 'booking_type', title: 'booking_type' },
        { id: 'participant_name', title: 'participant_name' },
        { id: 'start_date', title: 'start_date' },
        { id: 'end_date', title: 'end_date' },
        { id: 'last_modified_date', title: 'last_modified_date' },
        { id: 'created_by', title: 'created_by' },
        { id: 'status', title: 'status' },
        { id: 'virtual_status', title: 'virtual_status' },
      ],
      alwaysQuote: true,
      recordDelimiter: '\r\n'
    });

    await csvWriter.writeRecords(allBookings);
    this.logger.log(`Partial CSV created: ${csvPath}`);

    // 4️⃣ Combine if ready
    //await this.createServiceBookingListIfReady(partialsFolder, resultsFolder, deviceList);
    //await this.generateSBDownload(this.SERVICE_BOOKING_LIST_PREFIX);
  }

  async refreshDeviceUserIfTokenExpired(deviceUserDto: DeviceUsersDto) {
    const jwtService = new JwtService();
    const payload = await jwtService.decode(deviceUserDto.Token.access_token);

    const now = Date.now();
    //Get the token expiry time minus 3 seconds to allow time 
    //for the request to be sent to the NDIA
    const exp = new Date((payload.exp * 1000) - 3000).getTime();

    if (now >= exp) {
      return await this.deviceUserService.findOne(deviceUserDto.DeviceName);
    }

    return deviceUserDto;
  }

  async generateServiceBookingDetailsAndSupportDetailsPartials(
    deviceName: string,
    portal: string,
    sbReportPayload: any,
    deviceUser: DeviceUsersDto
  ): Promise<void> {
    this.logger.log(`Processing SB_REPORT ServiceBookingDetails for ${deviceName} (${portal})...`);

    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0];
    const dateFolder = path.join(storagePath, today);
    const partialsFolder = path.join(dateFolder, 'partials');
    //const deviceUser: DeviceUsersDto = await this.deviceUserService.findOne(deviceName);

    const reportRecords = sbReportPayload?.response?.report_data || [];
    if (reportRecords.length === 0) {
      this.logger.warn(`No report data for ${deviceName}.`);
      return;
    }

    const allServiceBookings: any[] = [];
    const allSupportDetails: any[] = [];

    for (const record of reportRecords) {
      const { service_booking_id, participant } = record;
      if (!service_booking_id || !participant) continue;

      try {
        const localDeviceUser: DeviceUsersDto = await this.refreshDeviceUserIfTokenExpired(deviceUser);
        const url = `4.0/service-bookings/${service_booking_id}`;
        const method = 'GET';
        const body = null;
        const headers = { participant };
        const queryObject = null;
        const clientName = 'Aruma';
        const saveTransaction = false;

        const response = await this.defaultRequest(
          url,
          method,
          body,
          headers,
          queryObject,
          deviceName,
          clientName,
          saveTransaction,
          localDeviceUser
        );

        if (response?.success && response.result) {
          const result: any = response.result;
          const extractTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');

          // 1️⃣ ServiceBookingDetails
          const serviceRow = {
            participant_name: `${result.participant_name?.toUpperCase()}(${result.participant})`,
            booking_type: this.translateBookingType(result.booking_type),
            service_booking_id: result.service_booking_id,
            start_date: this.formatDate(result.start_date),
            end_date: this.formatDate(result.end_date),
            revised_end_date: this.formatDate(result.revised_end_date || '0000-00-00'),
            in_kind_program: result.inkind_program ? 'TRUE' : 'FALSE',
            status: result.status,
            virtual_status: result.virtual_status,
            total: result.items?.reduce((sum: number, i: any) => sum + (i.allocated_amount || 0), 0).toFixed(2),
            extract_time: extractTime,
          };
          allServiceBookings.push(serviceRow);

          // 2️⃣ SupportDetails
          if (Array.isArray(result.items) && result.items.length > 0) {
            let counter = 1;
            for (const item of result.items) {
              const supportRow = {
                product_category: this.translateProductCategory(item.product_category),
                product_category_item: item.product_category_item || '',
                product_category_item_description: item.product_category_item_desc || '',
                quantity: item.quantity,
                allocated_amount: item.allocated_amount,
                remaining_amount: item.remaining_amount,
                service_booking_id: result.service_booking_id,
                No: counter,
                extract_time: extractTime,
                unit_price: item.allocated_amount && item.quantity ? (item.allocated_amount / item.quantity).toFixed(2) : '',
              };
              allSupportDetails.push(supportRow);
              counter++;
            }
          }
        } else {
          this.logger.warn(`No details found for service booking ${service_booking_id}`);
        }
      } catch (err) {
        this.logger.error(`Error fetching service booking ${service_booking_id}: ${err.message}`);
      }

      // ⏱️ Throttle each call
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 3️⃣ Write partial CSVs
    if (allServiceBookings.length === 0 && allSupportDetails.length === 0) {
      this.logger.warn(`No details collected for ${deviceName}.`);
      return;
    }

    const serviceBookingDetailsCsvPath = path.join(partialsFolder, `ServiceBookingDetails_${deviceName}.csv`);
    const supportDetailsCsvPath = path.join(partialsFolder, `SupportDetails_${deviceName}.csv`);

    const sbCsvWriter = createObjectCsvWriter({
      path: serviceBookingDetailsCsvPath,
      header: [
        { id: 'participant_name', title: 'participant_name' },
        { id: 'booking_type', title: 'booking_type' },
        { id: 'service_booking_id', title: 'service_booking_id' },
        { id: 'start_date', title: 'start_date' },
        { id: 'end_date', title: 'end_date' },
        { id: 'revised_end_date', title: 'revised_end_date' },
        { id: 'in_kind_program', title: 'in_kind_program' },
        { id: 'status', title: 'status' },
        { id: 'virtual_status', title: 'virtual_status' },
        { id: 'total', title: 'total' },
        { id: 'extract_time', title: 'extract_time' },
      ],
      alwaysQuote: true,
      recordDelimiter: '\r\n'
    });

    const sdCsvWriter = createObjectCsvWriter({
      path: supportDetailsCsvPath,
      header: [
        { id: 'product_category', title: 'product_category' },
        { id: 'product_category_item', title: 'product_category_item' },
        { id: 'product_category_item_description', title: 'product_category_item_description' },
        { id: 'quantity', title: 'quantity' },
        { id: 'allocated_amount', title: 'allocated_amount' },
        { id: 'remaining_amount', title: 'remaining_amount' },
        { id: 'service_booking_id', title: 'service_booking_id' },
        { id: 'No', title: 'No' },
        { id: 'extract_time', title: 'extract_time' },
        { id: 'unit_price', title: 'unit_price' },
      ],
      alwaysQuote: true,
      recordDelimiter: '\r\n'
    });

    if (allServiceBookings.length > 0) await sbCsvWriter.writeRecords(allServiceBookings);
    if (allSupportDetails.length > 0) await sdCsvWriter.writeRecords(allSupportDetails);

    this.logger.log(`
      Partial CSVs created for ${deviceName}:
        - ${serviceBookingDetailsCsvPath}
        - ${supportDetailsCsvPath}`
    );
  }

  async createResultFilesAndUpload() {
    await this.clearTodaysResultsFolder();

    await this.generateResultFiles(this.SB_DOWNLOAD_PREFIX);
    await this.generateResultFiles(this.SERVICE_BOOKING_DETAILS_PREFIX);
    await this.generateResultFiles(this.SUPPORT_DETAILS_PREFIX);
    await this.generateResultFiles(this.SERVICE_BOOKING_LIST_PREFIX);

    await this.uploadResultsToSftp();
  }

  async clearTodaysResultsFolder() {
    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const resultsFolder = path.join(storagePath, today, 'results');

    try {
      const files = await fs.readdir(resultsFolder);

      // Delete each file/folder inside
      const deletePromises = files.map(file => {
        const filePath = path.join(resultsFolder, file);
        return fs.rm(filePath, { recursive: true, force: true });
      });

      await Promise.all(deletePromises);
      console.log(`Cleared contents of ${resultsFolder}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Folder doesn't exist yet → that's fine (first run of the day)
        console.log(`Results folder not found (yet): ${resultsFolder} → nothing to clear`);
        // Optionally create it so future writes don't fail
        await fs.mkdir(resultsFolder, { recursive: true });
      } else {
        console.error('Error clearing results folder:', error);
        throw error;
      }
    }
  }

  private async uploadResultsToSftp(): Promise<void> {
    const storagePath = this.configService.get<string>(EnvConstants.STORAGE_PATH);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const resultsFolder = path.join(storagePath, today, 'results');

    const requiredPrefixes = [
      'SBDownload_',
      'ServiceBookingDetails_',
      'ServiceBookingList_',
      'SupportDetails_',
    ];

    const allFiles = await fs.readdir(resultsFolder);
    const resultFiles: Record<string, string> = {};

    // Check if all files exist
    for (const prefix of requiredPrefixes) {
      const match = allFiles.find((f) => f.startsWith(prefix) && f.endsWith('.csv'));
      if (!match) {
        this.logger.warn(`Missing result file for prefix: ${prefix}`);
        return;
      }
      resultFiles[prefix] = path.join(resultsFolder, match);
    }

    this.logger.log('✅ All result files found, preparing to upload...');

    // Load SFTP credentials from environment variables
    const sftpHost = this.configService.get<string>(EnvConstants.SFTP_HOST);
    const sftpPort = parseInt(this.configService.get<string>(EnvConstants.SFTP_PORT) || '22', 10);
    const sftpUserName = this.configService.get<string>(EnvConstants.SFTP_USERNAME);
    const sftpRemotePath = this.configService.get<string>(EnvConstants.SFTP_REMOTE_PATH) || '/Bookings';
    const sftpKey = this.configService.get<string>(EnvConstants.SFTP_PRIVATE_KEY);

    const sftp = new Client();

    try {
      await sftp.connect({
        host: sftpHost,
        port: sftpPort,
        username: sftpUserName,
        privateKey: sftpKey,
      });

      this.logger.log(`Connected to SFTP: ${sftpHost}`);

      // Ensure remote folder exists
      const remoteExists = await sftp.exists(sftpRemotePath);
      if (!remoteExists) {
        await sftp.mkdir(sftpRemotePath, true);
      }

      // Upload all files
      for (const [prefix, filePath] of Object.entries(resultFiles)) {
        const fileName = path.basename(filePath);
        //const remoteFile = path.join(sftpRemotePath, fileName);
        const remoteFile = `${sftpRemotePath}/${fileName}`;

        await sftp.fastPut(filePath, remoteFile);
        this.logger.log(`⬆️  Uploaded ${fileName} to ${remoteFile}`);
      }

      this.logger.log('✅ All result files uploaded successfully.');
    } catch (err) {
      this.logger.error(`❌ SFTP upload failed: ${err.message}`);
      throw err;
    } finally {
      sftp.end();
      this.logger.log('🔌 SFTP connection closed.');
    }
  }

  private translateProductCategory(rawCategory: string): string {
    if (!rawCategory) return '';

    const category = rawCategory.trim().toUpperCase();

    const translationMap: Record<string, string> = {
      ASSISTIVE_TECHNOLOGY: 'Assistive Technology',
      CB_CHOICE_CONTROL: 'Improved Life Choices',
      CB_DAILY_ACTIVITY: 'Improved Daily Living Skills',
      CB_EMPLOYMENT: 'Finding and Keeping a Job',
      CB_HEALTH_WELLBEING: 'Improved Health and Wellbeing',
      CB_HOME_LIVING: 'Improved Living Arrangements',
      CB_LIFELONG_LEARNING: 'Improved Learning',
      CB_RELATIONSHIPS: 'Improved Relationships',
      CB_SOCIAL_COMMUNITY_CIVIC: 'Increased Social and Community Participation',
      CONSUMABLES: 'Consumables',
      DAILY_ACTIVITIES: 'Assistance with Daily Life',
      HOME_MODIFICATIONS: 'Home Modifications',
      SOCIAL_COMMUNITY_CIVIC: 'Assistance with Social, Economic and Community Participation',
      SUPPORT_COORDINATION: 'Support Coordination',
      TRANSPORT: 'Transport (Auto Payments)',
    };

    return translationMap[category] || '';
  }

  private translateBookingType(code: string): string {
    switch (code) {
      case 'ZSAG':
        return 'Standard Booking';
      case 'ZPLM':
        return 'Plan Managed';
      default:
        return code;
    }
  }

  private formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return format(d, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  }
}