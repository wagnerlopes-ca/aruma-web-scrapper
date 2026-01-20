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

    //@Cron('0 10 * * *') // Daily at 10:00 AM
    async processResults() {
        this.arumaService.createResultFilesAndUpload();

        console.log(`Initiating process of creating result files and upload to the SFTP server!`);
    }

    //@Cron('0 06 * * *') // Daily at 06:00 AM
    async nudgeClaims() {
        this.arumaService.postPaymentsNudge();

        console.log(`Initiating claim nudge process!`);
    }
}