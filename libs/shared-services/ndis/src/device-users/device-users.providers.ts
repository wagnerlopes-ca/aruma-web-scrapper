import { DeviceUsers } from '../../../../database/src/entities/device-users.entity'

export const DeviceUsersProviders = [
  {
    provide: 'DEVICE_USERS_REPOSITORY',
    useValue: DeviceUsers,
  },
];