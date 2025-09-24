import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, Module } from '@nestjs/common';
import { ArumaController } from './aruma.controller';
import { ArumaService } from './aruma.service';
import { RequestDto } from './dto/request.dto';
import { NotificationsService } from './notifications/notifications.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NDISService } from '@app/ndis/ndis.service';
import { ResponseDto } from './dto/response.dto';

const TEST_DOMAIN = 'https://sample-base-url';
const BASE_URL = '/ndia-aruma/v1';
const TEST_ENDPOINT = '/test-endpoint';

jest.mock('./aruma.service');
jest.mock('./auth/auth-bearer.guards.ts');

// Create a valid NestJS module to be used in place of the one we want to mock
@Module({})
class MockModule { }

jest.mock('@app/ndis', () => {
  return {
    NDISModule: {
      forRootAsync: jest.fn().mockImplementation(() => MockModule),
    },
    NDISService: jest.fn(),
  };
});

describe('NDIAMiddlewareController', () => {
  let controller: ArumaController;
  let service: ArumaService;

  let mockRequestDto: RequestDto;
  let mockHTTPRequest: Request;

  const mockNDISService = {
    // Mock NDISService methods if any
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({})],
      controllers: [ArumaController],
      providers: [
        ArumaService,
        {
          provide: NotificationsService,
          useValue: {},
        },
        {
          provide: NDISService,
          useValue: mockNDISService,
        },
        ConfigService,
      ],
    }).compile();

    controller = module.get<ArumaController>(ArumaController);
    service = module.get<ArumaService>(ArumaService);
    mockRequestDto = {
      participant: 'testParticipant',
      participant_surname: 'testLastName',
      date_of_birth: 'testBirthDate',
    } as RequestDto;
    mockRequestDto = {
    } as RequestDto;
    mockHTTPRequest = new Request(
      `${TEST_DOMAIN}${BASE_URL}${TEST_ENDPOINT}`
    );
    mockHTTPRequest['user'] = { sub: 'TEST_DEVICE' };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('healthCheck', () => {
    it('should return "Working"', async () => {
      const result = controller.healthCheck();
      expect(result).toBe('Working');
    });
  });

  describe('get', () => {
    it('should make a get request to the selected path', async () => {
      const mockResponse = {
        success: true,
        result: [],
        errors: undefined
      } as ResponseDto

      jest.spyOn(service, 'defaultRequest').mockResolvedValue(mockResponse);

      const result = await controller.get(
        mockHTTPRequest,
        null
      );

      expect(JSON.stringify(result)).toBe(JSON.stringify(mockResponse));
    });

    it('should handle HttpException for internal server error', async () => {
      jest
        .spyOn(service, 'defaultRequest')
        .mockRejectedValue(
          new HttpException(
            'Internal Server Error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );

      await expect(
        controller.get(mockHTTPRequest, null),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('post', () => {
    it('should make a post request to the selected path', async () => {
      const mockResponse = {
        success: true,
        result: [],
        errors: undefined
      } as ResponseDto

      jest.spyOn(service, 'defaultRequest').mockResolvedValue(mockResponse);

      const result = await controller.post(
        mockRequestDto,
        mockHTTPRequest
      );

      expect(JSON.stringify(result)).toBe(JSON.stringify(mockResponse));
    });

    it('should handle HttpException for internal server error', async () => {
      jest
        .spyOn(service, 'defaultRequest')
        .mockRejectedValue(
          new HttpException(
            'Internal Server Error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );

      await expect(
        controller.post(mockRequestDto, mockHTTPRequest),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('patch', () => {
    it('should make a patch request to the selected path', async () => {
      const mockResponse = {
        success: true,
        result: [],
        errors: undefined
      } as ResponseDto

      jest.spyOn(service, 'defaultRequest').mockResolvedValue(mockResponse);

      const result = await controller.patch(
        mockRequestDto,
        mockHTTPRequest,
        null
      );

      expect(JSON.stringify(result)).toBe(JSON.stringify(mockResponse));
    });

    it('should handle HttpException for internal server error', async () => {
      jest
        .spyOn(service, 'defaultRequest')
        .mockRejectedValue(
          new HttpException(
            'Internal Server Error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );

      await expect(
        controller.patch(mockRequestDto, mockHTTPRequest, null),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('delete', () => {
    it('should make a delete request to the selected path', async () => {
      const mockResponse = {
        success: true,
        result: [],
        errors: undefined
      } as ResponseDto

      jest.spyOn(service, 'defaultRequest').mockResolvedValue(mockResponse);

      const result = await controller.delete(
        mockHTTPRequest
      );

      expect(JSON.stringify(result)).toBe(JSON.stringify(mockResponse));
    });

    it('should handle HttpException for internal server error', async () => {
      jest
        .spyOn(service, 'defaultRequest')
        .mockRejectedValue(
          new HttpException(
            'Internal Server Error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
        );

      await expect(
        controller.delete(mockHTTPRequest),
      ).rejects.toThrow(HttpException);
    });
  });
});
