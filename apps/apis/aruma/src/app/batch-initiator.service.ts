import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArumaService } from './aruma.service';

@Injectable()
export class BatchInitiatorService {
    constructor(
        private readonly arumaService: ArumaService
    ) { }

    //@Cron('0 3 * * *') // Daily at 3 AM
    async initiateDailyBatch() {
        this.arumaService.requestReports();

        console.log(`Requesting SB_REPORT notifications!`);
    }

    //@Cron('30 9 * * *') // Daily at 9:30 AM
    async processResults() {
        this.arumaService.createResultFilesAndUpload();

        console.log(`Initiating process of creating result files and upload to the SFTP server!`);
    }
}