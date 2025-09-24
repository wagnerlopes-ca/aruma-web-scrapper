import { Test, TestingModule } from '@nestjs/testing';

import { ArumaService } from './aruma.service';
import { NDISService } from '@app/ndis';
import { NotificationsService } from './notifications/notifications.service';
import { PlannedOutagesService } from './planned-outages/planned-outages.service';
import { DeviceUsersService } from './device-users/device-users.service';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';

// Create a valid NestJS module to be used in place of the one we want to mock
@Module({})
class MockModule { }

// Identify the Module you want to mock and mock it
jest.mock('@app/ndis', () => {
  return {
    NDISModule: {
      forRootAsync: jest.fn().mockImplementation(() => MockModule)
    },
    NDISService: jest.fn(),
    DeviceUsersService: {
      findOne: jest.fn()
    }
  };
});

describe('NDIAMiddlewareService', () => {
  let ndiaMiddlewareService: ArumaService;
  let ndisService: NDISService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({})],
      providers: [
        ArumaService,
        {
          provide: NDISService,
          useValue: {
            getPlans: jest.fn(),
            sendRequest: jest.fn()
          },
        },
        {
          provide: PlannedOutagesService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            defaultRequest: jest.fn(),
          },
        },
        {
          provide: DeviceUsersService,
          useValue: {
            findOne: jest.fn(),
          },
        }
      ],
    }).compile();

    ndiaMiddlewareService = module.get<ArumaService>(
      ArumaService,
    );
    ndisService = module.get<NDISService>(NDISService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendRequest', () => {
    it('should send a request to the NDIA', async () => {
      const response = new Response();

      jest
        .spyOn(ndisService, 'sendRequest')
        .mockResolvedValue(response);

      const result = await ndiaMiddlewareService.sendRequest(
        'GET',
        'plans',
        null,
        null,
        'Test_Device',
        'Test Client',
        null,
        true
      );

      expect(result).toEqual(response);
    });
  });
});