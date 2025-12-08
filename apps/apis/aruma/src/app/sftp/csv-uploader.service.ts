import Client from 'ssh2-sftp-client';
import * as path from 'path';
import * as fs from 'fs/promises';
//import { format } from 'date-fns';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EnvConstants } from '../../../env/env-constants';

export class CsvUploaderService {
  constructor(private configService: ConfigService, private logger: Logger) { }

  /**
   * Uploads all result CSVs (SBDownload, ServiceBookingDetails, ServiceBookingList, SupportDetails)
   * to the configured SFTP server if they all exist.
   */
  async uploadResultsToSftp(): Promise<void> {
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
    const sftpRemotePath = this.configService.get<string>(EnvConstants.SFTP_REMOTE_PATH) || '/uploads';
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
}
