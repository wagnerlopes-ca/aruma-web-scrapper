import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArumaService } from './aruma.service';

@Injectable()
export class BatchInitiatorService {
    constructor(
        private readonly arumaService: ArumaService
    ) { }

    @Cron('0 1 * * *') // Daily at 1 AM
    async initiateDailyBatch() {
        this.arumaService.requestReports();

        console.log(`Requesting SB_REPORT notifications!`);
    }

    @Cron('0 5 * * *') // Daily at 5 AM
    async checkAndRequestMissingSBReports() {
        // 1) Check for missing SB_REPORT notifications
        // 1.1) If there are missing notifications:
        //     1.1.1) If the subscription is not active: resubscribe to all notifications
        //     1.1.2) Request the missing SB_REPORT notifications
        await this.arumaService.checkAndRequestMissingSBReports();

        console.log(`Finished checking and requesting SB_REPORT notifications.`);
    }

    @Cron('0 10 * * *') // Daily at 10:00 AM
    async processResults() {
        this.arumaService.createResultFilesAndUpload();

        console.log(`Initiating process of creating result files and upload to the SFTP server!`);
    }

    @Cron('0 20 * * *') // Daily at 08:00 PM (20:00)
    async nudgeClaims() {
        this.arumaService.postPaymentsNudge();

        console.log(`Initiating claim nudge process!`);
    }
}