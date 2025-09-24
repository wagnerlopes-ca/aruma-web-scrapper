import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from './notifications.service';
import { NDISService } from '@app/ndis';
import { DeviceUsersService } from '../device-users/device-users.service';
import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SESEmailService } from '@app/email-service/ses-email-service.service';

// Create a valid NestJS module to be used in place of the one we want to mock
@Module({})
class MockModule {}

jest.mock('@app/ndis', () => {
  return {
    NDISModule: {
      forRootAsync: jest.fn().mockImplementation(() => MockModule),
    },
    NDISService: jest.fn(), // Mock other exports as necessary or keep them as is
  };
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NDISService,
          useValue: {
            getParticipantPlan: jest.fn(),
          },
        },
        {
          provide: DeviceUsersService,
          useValue: {
            findOne: jest.fn(),
            setWebhook: jest.fn()
          },
        },
        ConfigService,
        SESEmailService
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
