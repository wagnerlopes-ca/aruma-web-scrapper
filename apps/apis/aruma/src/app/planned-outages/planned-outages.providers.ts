import { PlannedOutages } from '@app/database/entities/planned-outages.entity';

export const PlannedOutagesProviders = [
  {
    provide: 'PLANNED_OUTAGES_REPOSITORY',
    useValue: PlannedOutages,
  },
];