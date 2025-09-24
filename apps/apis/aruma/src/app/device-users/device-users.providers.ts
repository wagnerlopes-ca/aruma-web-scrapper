import { DeviceUsers } from '@app/database/entities/device-users.entity'

export const DeviceUsersProviders = [
  {
    provide: 'DEVICE_USERS_REPOSITORY',
    useValue: DeviceUsers,
  },
];