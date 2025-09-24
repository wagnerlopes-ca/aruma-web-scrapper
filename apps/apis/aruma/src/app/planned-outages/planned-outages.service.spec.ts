import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PlannedOutagesService } from './planned-outages.service';

const mockPlannedOutagesRepository = {
  create: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
};

describe('PlannedOutagesService', () => {
  let plannedOutagesService: PlannedOutagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannedOutagesService,
        {
          provide: 'PLANNED_OUTAGES_REPOSITORY',
          useValue: mockPlannedOutagesRepository,
        },
      ],
    }).compile();

    plannedOutagesService = module.get<PlannedOutagesService>(PlannedOutagesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an PlannedOutages', async () => {
      const id = 1;
      const startDateTime = new Date();
      const endDateTime = new Date();
      endDateTime.setDate(startDateTime.getDate() + 1);

      mockPlannedOutagesRepository.create.mockReturnValueOnce({
        Id: id,
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      });

      const result = await plannedOutagesService.create(startDateTime, endDateTime);

      expect(mockPlannedOutagesRepository.create).toHaveBeenCalledWith({
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      });
      expect(result).toEqual({
        Id: 1,
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      });
    });
  });

  describe('findOne', () => {
    it('should find an PlannedOutages', async () => {
      const id = 1;
      const startDateTime = new Date();
      const endDateTime = new Date();
      endDateTime.setDate(startDateTime.getDate() + 1);

      mockPlannedOutagesRepository.findOne.mockReturnValueOnce({
        Id: id,
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      });

      const result = await plannedOutagesService.findOne(id);

      expect(mockPlannedOutagesRepository.findOne).toHaveBeenCalledWith({
        where: { Id: id },
      });
      expect(result).toEqual({
        Id: id,
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      });
    });
  });

  describe('update', () => {
    it('should update an PlannedOutages', async () => {
      const id = 1;
      const startDateTime = new Date();
      const endDateTime = new Date();
      endDateTime.setDate(startDateTime.getDate() + 1);

      await plannedOutagesService.update(id, startDateTime, endDateTime);

      expect(mockPlannedOutagesRepository.update).toHaveBeenCalledWith(
        { StartDateTime: startDateTime,  EndDateTime: endDateTime},
        { where: { Id: id } },
      );
    });
  });

  describe('remove', () => {
    it('should remove an PlannedOutages', async () => {
      const id = 1;

      mockPlannedOutagesRepository.findOne.mockReturnValueOnce({
        destroy: mockPlannedOutagesRepository.destroy,
      });

      await plannedOutagesService.remove(id);

      expect(mockPlannedOutagesRepository.findOne).toHaveBeenCalledWith({
        where: { Id: id },
      });

      expect(mockPlannedOutagesRepository.destroy).toHaveBeenCalled();
    });

    it('should throw NotFoundException if PlannedOutages not found.', async () => {
      mockPlannedOutagesRepository.findOne.mockReturnValueOnce(null);

      await expect(
        plannedOutagesService.remove(2),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
