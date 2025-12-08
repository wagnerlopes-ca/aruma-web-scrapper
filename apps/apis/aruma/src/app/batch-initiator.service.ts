import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
//import { CronExpression } from '@nestjs/schedule'; //FOR TESTING - DELETE
import * as fs from 'fs/promises';
import * as path from 'path';
import { ArumaService } from './aruma.service';
import { ConfigService } from '@nestjs/config';
import { EnvConstants } from '../../env/env-constants';

@Injectable()
export class BatchInitiatorService {
    constructor(
        private readonly arumaService: ArumaService,
        private readonly configService: ConfigService
    ) { }

    /*@Cron('0 8 * * *') // Daily at 8 AM (adjust to your time)
    //@Cron(CronExpression.EVERY_30_SECONDS) //FOR TESTING - DELETE
    //@Cron('53 12 * * *') //Daily at 12:53  //FOR TESTING - DELETE
    async initiateDailyBatch() {
        const storagePath = this.configService.get(EnvConstants.STORAGE_PATH);
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const dateFolder = path.join(storagePath, today);

        // Create folder if not exists
        await fs.mkdir(dateFolder, { recursive: true });

        // start process
        this.arumaService.initWebScrapper();

        console.log(`Initiated batch for ${today}. Waiting for webhooks...`);
    }*/
}