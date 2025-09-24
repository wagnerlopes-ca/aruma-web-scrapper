import { Test, TestingModule } from '@nestjs/testing';
import { NDISService } from './ndis.service';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('NDISService', () => {
  let service: NDISService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NDISService],
    }).compile();

    service = module.get<NDISService>(NDISService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendRequest', () => {
    it('should return NDIS information', async () => {
      const method = 'GET';
      const path = '4.0/plans?participant=430395969&participant_surname=Holmes&date_of_birth=1981-11-21';
      const extraHeaders = { authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJORElBX0ludGVncmF0aW9uX1FBIiwiaWF0IjoxNzI2NzI5OTY2LCJleHAiOjE3MjY3MzAwMjZ9.o4bHnbpKWCU4-YvZPezQpuH3SHXbJNbXQMwgHtxPdy4"
      };
      const clientName = 'testeCustomerName';
      const deviceName = 'testDeviceName';
      const requestBody = undefined;
      const queryObject = {
        participant: "430395969",
        participant_surname: "Holmes",
        date_of_birth: "1981-11-21",
      };

      const responseParticipantInformation = {
        is_pace_plan: true,
        participant_plan_id: 99999,
        plan_end_date: '1900-01-01',
        plan_first_start_date: '1900-01-01',
        plan_start_date: '1900-01-01',
      };

      const mockResponse = {
        success: true,
        result: [responseParticipantInformation],
        errors: []
      };

      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await service.sendRequest(
        method,
        path,
        extraHeaders,
        clientName,
        deviceName,
        requestBody,
        queryObject,
        true
      );

      expect(result).toEqual(mockResponse);
    });
  });
});