import { Test, TestingModule } from '@nestjs/testing';
import { DeviceUsersService } from './device-users.service';

const mockDeviceUsersRepository = {
  create: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
};

describe('DeviceUsersService', () => {
  let deviceUsersService: DeviceUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceUsersService,
        {
          provide: 'DEVICE_USERS_REPOSITORY',
          useValue: mockDeviceUsersRepository,
        },
      ],
    }).compile();

    deviceUsersService = module.get<DeviceUsersService>(DeviceUsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should get a DeviceUser', async () => {
      const deviceName = 'DeviceNameTest';

      const mockDeviceUser = {
        Certificate: null,
        Token: null,
        DeviceName: deviceName,
        ClientName: 'ClientNameTest',
        Password: 'PasswordTest',
        OrganizationId: '999999999',
        ClientId: 'asdfg'
      }

      mockDeviceUsersRepository.findOne.mockReturnValueOnce(mockDeviceUser);

      const result = await deviceUsersService.findOne(
        deviceName
      );

      expect(result).toEqual(mockDeviceUser);
    });
  });
});
