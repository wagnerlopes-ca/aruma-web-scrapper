import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  HttpStatus
} from '@nestjs/common';
import { DestroyOptions, Op } from 'sequelize';
import { PlannedOutagesDto } from './dto/planned-outages.dto';
import { PlannedOutages } from '@app/database/entities/planned-outages.entity';

@Injectable()
export class PlannedOutagesService {
  private readonly logger = new Logger(PlannedOutagesService.name);

  constructor(
    @Inject('PLANNED_OUTAGES_REPOSITORY')
    private plannedOutagesRepository: typeof PlannedOutages,
  ) { }

  async stopIfOutage() {
    const now = new Date(Date.now());

    const result = await this.plannedOutagesRepository.findAll({
      where: {
        StartDateTime: {
          [Op.lte]: now
        },
        EndDateTime: {
          [Op.gt]: now
        }
      }
    });

    if (result.length == 0) {
      return null
    } else {
      throw new HttpException(
        'The service is unavailable due to an NDIA outage',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  async create(
    startDateTime: Date,
    endDateTime: Date
  ): Promise<PlannedOutagesDto> {
    return await this.plannedOutagesRepository.create({
      StartDateTime: startDateTime,
      EndDateTime: endDateTime
    });
  }

  async findOne(id: number): Promise<PlannedOutagesDto> {
    const PlannedOutagesDto = await this.plannedOutagesRepository.findOne({
      where: {
        Id: id
      },
    });

    return PlannedOutagesDto;
  }

  async findAll(): Promise<PlannedOutages[]> {
    return await this.plannedOutagesRepository.findAll<PlannedOutages>();
  }

  async update(
    id: number,
    startDateTime: Date,
    endDateTime: Date
  ): Promise<number[]> {
    return this.plannedOutagesRepository.update(
      {
        StartDateTime: startDateTime,
        EndDateTime: endDateTime
      },
      {
        where: {
          Id: id
        }
      }
    );
  }

  async remove(
    id: number
  ): Promise<number> {
    const plannedOutage = await this.plannedOutagesRepository.findOne({
      where: {
        Id: id
      },
    });

    if (!plannedOutage) {
      throw new NotFoundException(
        `PlannedOutages with Id ${id} not found in database.`,
      );
    }

    const destroyOptions: DestroyOptions = {
      where: {
        Id: id
      },
    };

    const affectedRows = await this.plannedOutagesRepository.destroy(destroyOptions);

    if (affectedRows === 0) {
      throw new NotFoundException(
        `No PlannedOutages found with Id ${id}.`,
      );
    }

    return affectedRows;
  }
}
