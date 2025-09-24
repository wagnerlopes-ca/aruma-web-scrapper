import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database/database.module';

import { PlannedOutagesService } from './planned-outages.service';
import { PlannedOutagesProviders } from './planned-outages.providers';

@Module({
  imports: [DatabaseModule],
  providers: [PlannedOutagesService, ...PlannedOutagesProviders],
  exports: [...PlannedOutagesProviders],
})
export class PlannedOutagesModule {}
