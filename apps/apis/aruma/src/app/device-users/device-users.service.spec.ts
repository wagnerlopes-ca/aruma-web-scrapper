import { Test, TestingModule } from '@nestjs/testing';
import { DeviceUsersService } from './device-users.service';
import { FieldCryptoService } from '@app/database/crypto/field-crypto.service';

const mockDeviceUsersRepository = {
  create: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
};

const mockFieldCrypto = {
  encrypt: jest.fn((value: string | null | undefined) => value ?? null),
  decrypt: jest.fn((value: string | null | undefined) => value ?? null),
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
        {
          provide: FieldCryptoService,
          useValue: mockFieldCrypto,
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
        OrganizationId: '999999999'
      }

      mockDeviceUsersRepository.findOne.mockReturnValueOnce(mockDeviceUser);

      const result = await deviceUsersService.findOne(
        deviceName
      );

      expect(result).toEqual(mockDeviceUser);
      expect(mockFieldCrypto.decrypt).toHaveBeenCalled();
    });
  });
});
