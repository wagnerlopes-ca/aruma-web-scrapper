import {
  Injectable,
  Logger,
  HttpException,
  InternalServerErrorException
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
import Database from 'better-sqlite3';

@Injectable()
export class ArumaService {
  private readonly logger = new Logger(ArumaService.name);
  private db: Database;

  private readonly SB_DOWNLOAD_PREFIX = 'SBDownload';
  private readonly SERVICE_BOOKING_LIST_PREFIX = 'ServiceBookingList';
  private readonly SERVICE_BOOKING_DETAILS_PREFIX = 'ServiceBookingDetails';
  private readonly SUPPORT_DETAILS_PREFIX = 'SupportDetails';

  constructor(
    private readonly ndisService: NDISService,
    private readonly plannedOutagesService: PlannedOutagesService,
    private readonly configService: ConfigService,
    private readonly deviceUserService: DeviceUsersService
  ) {
    this.initializeDbConnection();
  }

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

  public async postPaymentsBatchFile(sftpFileName: string) {
    try {
      const sftpClaimFileFolder = 'Claims';
      const sftpResultFileFolder = 'ClaimsResponse';

      const csvString = await this.downloadFileFromSftp(sftpFileName, sftpClaimFileFolder);

      const csvRows: any[] = await this.parseCsvStringIntoArray(csvString);

      const deviceName = this.getDeviceNameFromCsv(csvRows);

      if (deviceName) {
        //List with maximum of 5000 items
        const requestBodyList = await this.csvToBulkPaymentPayloads(csvRows);

        const responseList = [];

        for (let i = 0; i < requestBodyList.length; i++) {
          const body = requestBodyList[i];

          const response = await this.postPaymentBatch(body, deviceName);

          this.logger.log(response);

          responseList.push(response);

          const fileName = `PaymentBulkUpload_${sftpFileName}_${response.batch_reference_name}`;
          this.uploadContentStringToSftp(JSON.stringify(response), fileName, sftpResultFileFolder);
        }

        return responseList;
      }
    } catch (exception) {
      this.logger.fatal(exception);
    }
  }

  public async postPaymentsNudge() {
    const paymentsPending: Array<{
      id: number;
      device_name: string;
      batch_reference_name: string;
      submitted_at: string;
      status: string;
      completed_at: string | null;
    }> = await this.getAllBatches('pending');

    const resultList = [];

    for (let i = 0; i < paymentsPending?.length; i++) {
      const payment = paymentsPending[i];

      const result = await this.requestBulkClaimReport(payment.device_name, payment.batch_reference_name);

      const nudgeResult = {
        payment: payment,
        result: result
      }

      resultList.push(nudgeResult);

      this.logger.log(nudgeResult);
    }

    if (resultList?.length > 0) {
      return resultList;
    } else {
      return {
        success: true,
        result: 'No pending batches found!'
      }
    }
  }

  private getDeviceNameFromCsv(csvRows: any[]) {
    const devicesListString: string = this.configService.get(EnvConstants.DEVICES_LIST);
    const deviceList: DeviceDto[] = JSON.parse(devicesListString);
    const providerNumber = csvRows[0].REGISTRATIONNUMBER;

    for (let i = 0; i < deviceList.length; i++) {
      if (deviceList[i].provider == providerNumber) {
        return deviceList[i].deviceName;
      }
    }

    return null;
  }

  private getBatchReferenceName() {
    const now = new Date();

    const YY = now.getFullYear().toString().slice(-2);              // 26
    const MM = String(now.getMonth() + 1).padStart(2, '0');         // 01–12
    const DD = String(now.getDate()).padStart(2, '0');              // 01–31
    const HH = String(now.getHours()).padStart(2, '0');             // 00–23
    const mm = String(now.getMinutes()).padStart(2, '0');           // 00–59
    const SS = String(now.getSeconds()).padStart(2, '0');           // 00–59
    const mmm = String(now.getMilliseconds()).padStart(3, '0');      // 000–999

    return `${YY}${MM}${DD}${HH}${mm}${SS}${mmm}.CSV`;
  }

  private async postPaymentBatch(body: any, deviceName: string) {
    const url = '4.0/payments/batch';
    const method = 'POST';
    const batchReferenceName = this.getBatchReferenceName();
    const headers = {
      batch_reference_name: batchReferenceName,
      "Content-Type": "application/json"
    };
    const queryObject = null;
    const clientName = "Aruma";
    const saveTransaction = false;

    try {
      const deviceUser = await this.deviceUserService.findOne(deviceName);

      if(deviceUser) {
        const response = await this.defaultRequest(
          url,
          method,
          body,
          headers,
          queryObject,
          deviceName,
          clientName,
          saveTransaction,
          deviceUser
        );
        
        await this.logBatchSubmission(batchReferenceName, deviceName);
  
        return {
          batch_reference_name: batchReferenceName,
          response: response
        };
      } else {
        this.logger.error({
          deviceName: deviceName,
          message: 'Device not found'
        })
      }

    } catch (exception) {
      this.logger.fatal(exception);
    }
  }

  private async requestBulkClaimReport(deviceName: string, batchReferenceName: string) {
    const url = '3.0/notifications/report';
    const method = 'POST';
    const headers = {
      "Content-Type": "application/json"
    };
    const body = {
      event_id: 'BULK_CLAIM_REPORT',
      batch_reference_name: batchReferenceName
    }
    const queryObject = null;
    const clientName = "Aruma";
    const saveTransaction = false;

    try {
      const deviceUser = await this.deviceUserService.findOne(deviceName);

      const response = await this.defaultRequest(
        url,
        method,
        body,
        headers,
        queryObject,
        deviceName,
        clientName,
        saveTransaction,
        deviceUser
      );

      return {
        batch_reference_name: batchReferenceName,
        response: response
      };
    } catch (exception) {
      this.logger.fatal(exception);
    }
  }

  /**
   * Downloads a file from SFTP server and returns its content as string
   * @param remoteFileName Name of the file (e.g. 'SBDownload_20250113.csv')
   * @param remoteFolder Remote folder path (e.g. '/Bookings' or '/Bookings/2025-01')
   * @returns Promise<string> Content of the remote file
   * @throws Error if connection fails, file not found, or permission denied
   */
  private async downloadFileFromSftp(
    remoteFileName: string,
    remoteFolder: string
  ): Promise<string> {
    const sftpHost = this.configService.get<string>(EnvConstants.SFTP_HOST);
    const sftpPort = parseInt(this.configService.get<string>(EnvConstants.SFTP_PORT) || '22', 10);
    const sftpUserName = this.configService.get<string>(EnvConstants.SFTP_USERNAME);
    const sftpKey = this.configService.get<string>(EnvConstants.SFTP_PRIVATE_KEY);

    const sftp = new Client();

    try {
      await sftp.connect({
        host: sftpHost,
        port: sftpPort,
        username: sftpUserName,
        privateKey: sftpKey,
      });

      this.logger.log(`Connected to SFTP for download: ${sftpHost}`);

      // Build full remote path
      const remotePath = `${remoteFolder.replace(/\/$/, '')}/${remoteFileName}`;

      // Check if file exists
      const exists = await sftp.exists(remotePath);
      if (!exists) {
        throw new Error(`Remote file not found: ${remotePath}`);
      }

      // Download file content directly to buffer
      const contentBuffer = await sftp.get(remotePath);

      // Assuming the files are text/CSV → convert to UTF-8 string
      const content = contentBuffer.toString('utf-8');

      this.logger.log(`Downloaded file successfully: ${remotePath} (${content.length} characters)`);

      return content;

    } catch (err) {
      this.logger.error(`SFTP download failed for ${remoteFileName}: ${err.message}`);
      throw err;
    } finally {
      try {
        sftp.end();
        this.logger.debug('SFTP connection closed after download');
      } catch (closeErr) {
        // ignore close errors in finally block
      }
    }
  }

  private async csvToBulkPaymentPayloads(
    rows: any[]
  ): Promise<Array<{ bulk_payment_request: any[] }>> {
    const maxItemsPerRequest = 5000;

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
        participant_approved: participant,
        inkind_flag: row.PARTICIPANTAPPROVED === 'True',
        claim_type: row.CLAIMTYPE || '',
        claim_reason: row.CANCELLATIONREASON || '',
        abn_provider: row.ABNOFSUPPORTPROVIDER ? Number(row.ABNOFSUPPORTPROVIDER) : null,
        abn_not_available: false,
        exemption_reason: '',
        hours: row.HOURS
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

  private async parseCsvStringIntoArray(csvString: string) {
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

    return rows;
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

  async saveReport(deviceName: string, payloadsFolder: string, sbReportPayload: any) {
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
      product_category: r.product_category || "",
      product_category_item: r.product_category_item || "",
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
      alwaysQuote: true
    });

    // 4. Write CSV
    await csvWriter.writeRecords(rows);

    console.log(`✅ CSV saved in ${csvFilePath}`);
  }

  async processBulkProcessFinish(
    deviceName: string,
    folder: string,
    payload: any,
  ): Promise<string> {
    // 1. Build filename
    const timestamp = this.getMelbourneTimestamp();

    const fileName = `BulkProcessFinish_${deviceName}_${timestamp}.csv`;

    const csvFilePath = path.join(folder, fileName);

    // 2. Extract data rows from payload
    const rows = (payload.response || []).map((r: any) => ({
      participant_name: r.participant_name ?? "",
      participant: r.participant ?? "",
      claim_number: r.claim_number ?? "",
      claimed_amount: r.claimed_amount ?? "",
      invoice_number: r.invoice_number ?? "",
      claim_status: r.claim_status ?? "",
      start_date: r.start_date ?? "",
      end_date: r.end_date ?? "",
      product_category: r.product_category ?? "",
      product_category_item: r.product_category_item ?? "",
      product_description: r.product_description ?? "",
      claim_type: r.claim_type ?? "",
      claim_reason: r.claim_reason ?? "",
      amount: r.amount ?? "",
      quantity: r.quantity ?? "",
      tax_code: r.tax_code ?? "",
      plan_id: r.plan_id ?? "",
      service_agreement: r.service_agreement ?? "",
      inkind_flag: r.inkind_flag?.toString() ?? "false",
      submit_date: r.submit_date ?? "",
      reject_reason_code: r.reject_reason_code ?? "",
      paid_date: r.paid_date ?? "",
      submit_by: r.submit_by ?? "",
      abn_provider: r.abn_provider ?? "",
      exemption_reason: r.exemption_reason ?? "",
      ref_doc_no: r.ref_doc_no ?? "",
      clearing_number: r.clearing_number ?? "",
      claim_Reference: "",  // extra empty column as per your example
    }));

    // 3. Define CSV writer (headers must match CSV order)
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'participant_name', title: 'participant_name' },
        { id: 'participant', title: 'participant' },
        { id: 'claim_number', title: 'claim_number' },
        { id: 'claimed_amount', title: 'claimed_amount' },
        { id: 'invoice_number', title: 'invoice_number' },
        { id: 'claim_status', title: 'claim_status' },
        { id: 'start_date', title: 'start_date' },
        { id: 'end_date', title: 'end_date' },
        { id: 'product_category', title: 'product_category' },
        { id: 'product_category_item', title: 'product_category_item' },
        { id: 'product_description', title: 'product_description' },
        { id: 'claim_type', title: 'claim_type' },
        { id: 'claim_reason', title: 'claim_reason' },
        { id: 'amount', title: 'amount' },
        { id: 'quantity', title: 'quantity' },
        { id: 'tax_code', title: 'tax_code' },
        { id: 'plan_id', title: 'plan_id' },
        { id: 'service_agreement', title: 'service_agreement' },
        { id: 'inkind_flag', title: 'inkind_flag' },
        { id: 'submit_date', title: 'submit_date' },
        { id: 'reject_reason_code', title: 'reject_reason_code' },
        { id: 'paid_date', title: 'paid_date' },
        { id: 'submit_by', title: 'submit_by' },
        { id: 'abn_provider', title: 'abn_provider' },
        { id: 'exemption_reason', title: 'exemption_reason' },
        { id: 'ref_doc_no', title: 'ref_doc_no' },
        { id: 'clearing_number', title: 'clearing_number' },
        { id: 'claim_Reference', title: 'claim_Reference' },
      ],
      alwaysQuote: true
    });

    // 4. Write CSV
    await csvWriter.writeRecords(rows);

    // Upload to SFTP if required
    const bulkProcessFinishRemoteFolder = 'ClaimsResponse';
    this.uploadFileToSftp(csvFilePath, fileName, bulkProcessFinishRemoteFolder);

    this.markBatchCompleted(payload.batch_reference_name);

    console.log(`✅ Bulk process finish CSV saved in ${csvFilePath} (${rows.length} rows)`);

    return csvFilePath;
  }

  async processRemitAdvGenerated(
    deviceName: string,
    folder: string,
    payload: any,
  ): Promise<string> {
    // 1. Build filename
    const timestamp = this.getMelbourneTimestamp();

    const fileName = `Remittence_${deviceName}_${timestamp}.csv`;

    const csvFilePath = path.join(folder, fileName);

    // 2. Extract data rows from payload
    const rows = (payload.response?.remittance_advice || []).map((r: any) => ({
      payeebp: r.payeebp ?? "",
      z4no: r.z4no ?? "",
      finyrs: r.finyrs ?? "",
      payreqnum: r.payreqnum ?? "",
      payreqdocdate: r.payreqdocdate ?? "",
      provclaimref: r.provclaimref ?? "",
      itemid: r.itemid ?? "",
      itemqty: r.itemqty ?? "",
      unitprice: r.unitprice ?? "",
      amountclaimed: r.amountclaimed ?? "",
      amountpaid: r.amountpaid ?? "",
      participantbp: r.participantbp ?? "",
      participantname: r.participantname ?? "",
      supportstartdate: r.supportstartdate ?? "",
      supportenddate: r.supportenddate ?? "",
      servicebookingnum: r.servicebookingnum ?? "",
      bulkclmid: r.bulkclmid ?? "",
      claimtype: r.claimtype ?? "",
      cancelrsn: r.cancelrsn ?? "",
    }));

    // 3. Define CSV writer (headers must match CSV order exactly)
    const csvWriter = createObjectCsvWriter({
      path: csvFilePath,
      header: [
        { id: 'payeebp', title: 'payeebp' },
        { id: 'z4no', title: 'z4no' },
        { id: 'finyrs', title: 'finyrs' },
        { id: 'payreqnum', title: 'payreqnum' },
        { id: 'payreqdocdate', title: 'payreqdocdate' },
        { id: 'provclaimref', title: 'provclaimref' },
        { id: 'itemid', title: 'itemid' },
        { id: 'itemqty', title: 'itemqty' },
        { id: 'unitprice', title: 'unitprice' },
        { id: 'amountclaimed', title: 'amountclaimed' },
        { id: 'amountpaid', title: 'amountpaid' },
        { id: 'participantbp', title: 'participantbp' },
        { id: 'participantname', title: 'participantname' },
        { id: 'supportstartdate', title: 'supportstartdate' },
        { id: 'supportenddate', title: 'supportenddate' },
        { id: 'servicebookingnum', title: 'servicebookingnum' },
        { id: 'bulkclmid', title: 'bulkclmid' },
        { id: 'claimtype', title: 'claimtype' },
        { id: 'cancelrsn', title: 'cancelrsn' },
      ],
      alwaysQuote: true,
    });

    // 4. Write CSV
    await csvWriter.writeRecords(rows);

    // 5. Upload to SFTP
    const remitAdvRemoteFolder = 'Remittance'; // ← adjust if needed
    await this.uploadFileToSftp(csvFilePath, fileName, remitAdvRemoteFolder);

    console.log(`✅ Remittance Advice CSV saved in ${csvFilePath} (${rows.length} rows)`);

    return csvFilePath;
  }

  getTodaysFolder() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  }

  async processNotification(notificationPayload: any, deviceName: string, eventId: string): Promise<string> {
    try {
      const storagePath = this.configService.get<string>('STORAGE_PATH');
      const today = this.getTodaysFolder();
      const dateFolder = path.join(storagePath, today);
      const resultsFolder = path.join(dateFolder, 'results');
      const partialCsvsFolder = path.join(dateFolder, 'partials');
      const notificationsFolder = path.join(dateFolder, 'notifications');

      // 1. Ensure the folder exists
      await fs.mkdir(dateFolder, { recursive: true });
      await fs.mkdir(resultsFolder, { recursive: true });
      await fs.mkdir(partialCsvsFolder, { recursive: true });
      await fs.mkdir(notificationsFolder, { recursive: true });

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
      await this.saveReport(deviceName, notificationsFolder, notificationPayload);

      if (eventId === 'SB_REPORT') {
        await this.saveSBDownloadPartial(deviceName, partialCsvsFolder, notificationPayload, provider);
        await this.generateServiceBookingsListPartial(device.deviceName, device.portal, notificationPayload, deviceUser);
        await this.generateServiceBookingDetailsAndSupportDetailsPartials(device.deviceName, device.portal, notificationPayload, deviceUser);
      } else if (eventId === 'BULK_PROCESS_FINISH' || eventId === 'BULK_CLAIM_REPORT') {
        this.processBulkProcessFinish(deviceName, notificationsFolder, notificationPayload);
      } else if (eventId === 'REMIT_ADV_GENERATED') {
        this.processRemitAdvGenerated(deviceName, notificationsFolder, notificationPayload);
      } else {
        this.logger.error('Unknown notification received');
      }
    } catch (exception) {
      this.logger.fatal(exception);
    }

    return null;
  }

  async generateResultFiles(prefix: string): Promise<string | null> {
    const storagePath = this.configService.get<string>('STORAGE_PATH');
    const today = this.getTodaysFolder();
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
            //Remove quotes from the header to match the current system
            const headerRow = lines[0].replace(/"/g, '');

            //Combine header without quotes with the data with quotes
            combinedLines.push(headerRow, ...lines.slice(1));
          } else {
            //Skip header
            combinedLines.push(...lines.slice(1));
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

      const contentToWrite = combinedLines.join('\n') + '\n';
      await fs.writeFile(finalCsvPath, contentToWrite, 'utf-8');

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
    const today = this.getTodaysFolder();
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
      alwaysQuote: true
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
    const today = this.getTodaysFolder();
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
            participant_name: `${result.participant_name}(${result.participant})`,
            booking_type: this.translateBookingType(result.booking_type),
            service_booking_id: result.service_booking_id,
            start_date: this.formatDate(result.start_date),
            end_date: this.formatDate(result.end_date),
            revised_end_date: this.formatDate(result.revised_end_date || '00/00/0000'),
            in_kind_program: result.inkind_program ? 'true' : 'false',
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
                unit_price: item.allocated_amount && item.quantity ? (item.allocated_amount / item.quantity).toFixed(2) : 0,
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
      alwaysQuote: true
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
      alwaysQuote: true
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
    const today = this.getTodaysFolder();
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
    //const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const today = this.getTodaysFolder();
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

  /**
   * Uploads file content directly from a string (in memory) to SFTP.
   * Useful when you generate CSV content in memory and don't want to write it to disk first.
   */
  private async uploadContentStringToSftp(
    content: string,
    remoteFileName: string,
    remoteFolder: string
  ): Promise<void> {
    if (!content || typeof content !== 'string') {
      this.logger.error('Invalid content provided for SFTP upload (must be non-empty string)');
      throw new Error('Content must be a non-empty string');
    }

    // 1. Load SFTP config (same as before)
    const config = {
      host: this.configService.get<string>(EnvConstants.SFTP_HOST)!,
      port: parseInt(this.configService.get<string>(EnvConstants.SFTP_PORT) || '22', 10),
      username: this.configService.get<string>(EnvConstants.SFTP_USERNAME)!,
      privateKey: this.configService.get<string>(EnvConstants.SFTP_PRIVATE_KEY),
    };

    const sftp = new Client();

    try {
      this.logger.log(`Connecting to SFTP: ${config.host}:${config.port}`);
      await sftp.connect(config);

      // 2. Normalize and ensure remote folder exists
      const targetFolder = remoteFolder.replace(/\/$/, '');
      const remoteDirExists = await sftp.exists(targetFolder);

      if (!remoteDirExists) {
        await sftp.mkdir(targetFolder, true);
        this.logger.log(`Created remote directory: ${targetFolder}`);
      }

      // 3. Build full remote path
      const remoteFullPath = `${targetFolder}/${remoteFileName}`;

      // 4. Convert string content to Buffer (UTF-8)
      const contentBuffer = Buffer.from(content, 'utf-8');

      // 5. Upload from buffer
      await sftp.put(contentBuffer, remoteFullPath);

      this.logger.log(`⬆️ Uploaded (from memory): ${remoteFileName} → ${remoteFullPath}`);
      this.logger.log(`   Size: ${contentBuffer.length} bytes`);
      this.logger.log('✅ File uploaded successfully');
    } catch (err: any) {
      this.logger.error(`SFTP upload failed for ${remoteFileName}: ${err.message}`);
      throw err;
    } finally {
      try {
        await sftp.end();
        this.logger.debug('SFTP connection closed');
      } catch {
        // ignore close errors
      }
    }
  }

  private async uploadFileToSftp(
    localFilePath: string,
    remoteFileName: string,
    remoteFolder: string
  ): Promise<void> {
    // 1. Validate local file exists
    try {
      await fs.access(localFilePath, fs.constants.R_OK);
    } catch {
      this.logger.error(`Local file not found or not readable: ${localFilePath}`);
      throw new Error(`Cannot upload: file not accessible - ${localFilePath}`);
    }

    // 2. Load SFTP config
    const config = {
      host: this.configService.get<string>(EnvConstants.SFTP_HOST)!,
      port: parseInt(this.configService.get<string>(EnvConstants.SFTP_PORT) || '22', 10),
      username: this.configService.get<string>(EnvConstants.SFTP_USERNAME)!,
      privateKey: this.configService.get<string>(EnvConstants.SFTP_PRIVATE_KEY),
    };

    const sftp = new Client();

    try {
      this.logger.log(`Connecting to SFTP: ${config.host}:${config.port}`);
      await sftp.connect(config);

      // 3. Normalize and ensure remote folder exists
      const targetFolder = remoteFolder.replace(/\/$/, ''); // remove trailing slash
      const remoteDirExists = await sftp.exists(targetFolder);

      if (!remoteDirExists) {
        await sftp.mkdir(targetFolder, true);
        this.logger.log(`Created remote directory: ${targetFolder}`);
      }

      // 4. Build full remote path
      const remoteFullPath = `${targetFolder}/${remoteFileName}`;

      // 5. Upload
      await sftp.fastPut(localFilePath, remoteFullPath, {
        // optional: add some useful options if needed
        // step: (total, step) => { ... progress logging ... }
      });

      this.logger.log(`⬆️ Uploaded: ${remoteFileName} → ${remoteFullPath}`);
      this.logger.log('✅ File uploaded successfully');
    } catch (err: any) {
      this.logger.error(`SFTP upload failed for ${remoteFileName}: ${err.message}`);
      throw err;
    } finally {
      try {
        await sftp.end();
        this.logger.debug('SFTP connection closed');
      } catch {
        // ignore close errors
      }
    }
  }

  private translateProductCategory(rawCategory: string): string {
    if (!rawCategory) return '';

    const category = rawCategory.trim().toUpperCase();

    const translationMap: Record<string, string> = {
      ASSISTIVE_TECHNOLOGY: 'Assistive Technology',
      CB_CHOICE_CONTROL: 'CB Choice & Control',
      CB_DAILY_ACTIVITY: 'CBDaily Activity',
      CB_EMPLOYMENT: 'CB Employment',
      CB_HEALTH_WELLBEING: 'CB Health & Wellbeing',
      CB_HOME_LIVING: 'CB Home Living',
      CB_LIFELONG_LEARNING: 'CB Lifelong Learning',
      CB_RELATIONSHIPS: 'CB Relationships',
      CB_SOCIAL_COMMUNITY_CIVIC: 'CB SocialCommunity and Civic participa',
      CONSUMABLES: 'Consumables',
      DAILY_ACTIVITIES: 'Daily Activities',
      HOME_MODIFICATIONS: 'Home Modifications',
      SOCIAL_COMMUNITY_CIVIC: 'Social Community and Civic Participation',
      SUPPORT_COORDINATION: 'Support Coordination',
      TRANSPORT: 'Transport',
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

  private initializeDbConnection(): void {
    const storagePath = this.configService.get<string>(EnvConstants.STORAGE_PATH);
    const dbPath = path.join(storagePath, 'batches', 'batches.sqlite');

    try {
      this.db = new Database(dbPath, {});

      // Apply pragmas every time (safe & idempotent)
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -2000');

      this.logger.log(`Connected to batches SQLite database: ${dbPath}`);
    } catch (e) {
      this.logger.fatal(e);
      throw new InternalServerErrorException(e);
    }
  }

  private async logBatchSubmission(batchReferenceName: string, deviceName: string): Promise<void> {
    const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
    const insertQuery = this.db.prepare(`
      INSERT OR IGNORE INTO batches (device_name, batch_reference_name, submitted_at, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const info = insertQuery.run(deviceName, batchReferenceName, now);

    if (info.changes > 0) {
      this.logger.log(`Logged new batch: ${batchReferenceName}`);
    }
  }

  async getAllBatches(statusFilter?: 'pending' | 'completed'): Promise<Array<{
    id: number;
    device_name: string;
    batch_reference_name: string;
    submitted_at: string;
    status: string;
    completed_at: string | null;
  }>> {
    let query = `
      SELECT 
        id,
        device_name,
        batch_reference_name,
        submitted_at,
        status,
        completed_at
      FROM batches
    `;

    const params: any[] = [];

    if (statusFilter) {
      query += ` WHERE status = ?`;
      params.push(statusFilter);
    }

    query += ` ORDER BY submitted_at DESC`;

    const stmt = this.db.prepare(query);

    try {
      const rows = stmt.all(...params) as Array<{
        id: number;
        device_name: string;
        batch_reference_name: string;
        submitted_at: string;
        status: string;
        completed_at: string | null;
      }>;

      this.logger.debug(`Retrieved ${rows.length} batches` +
        (statusFilter ? ` (status: ${statusFilter})` : ''));

      return rows;
    } catch (err: any) {
      this.logger.error(`Failed to fetch batches: ${err.message}`);
      throw err;
    }
  }

  getMelbourneTimestamp() {
    const now = new Date();

    // Format each part in local (Melbourne) time
    const YY = now.getFullYear().toString().slice(-2);
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    return `${YY}${MM}${DD}${HH}${mm}${ss}`;
  };

  async markBatchCompleted(batchRef: string): Promise<void> {
    const now = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

    // First check current status (optional but useful for detailed logging)
    const selectStmt = this.db.prepare(`
      SELECT status FROM batches WHERE batch_reference_name = ?
    `);

    const row = selectStmt.get(batchRef) as { status: string } | undefined;

    if (!row) {
      this.logger.debug(`Batch not found: ${batchRef}`);
      return;
    }

    if (row.status === 'completed') {
      this.logger.debug(`Batch already completed: ${batchRef}`);
      return;
    }

    // Proceed with update
    const updateStmt = this.db.prepare(`
      UPDATE batches
      SET status = 'completed', completed_at = ?
      WHERE batch_reference_name = ?
    `);

    updateStmt.run(now, batchRef);

    this.logger.log(`Marked batch as completed: ${batchRef} at ${now}`);
  }
}