import {
  Inject,
  Injectable
} from '@nestjs/common';
import { DeviceUsers } from '../../../../database/src/entities/device-users.entity'
import { DeviceUsersDto } from './dto/device-users.dto';
import { DeviceTransformerDto } from './transformer/device-users-transformer.dto';

@Injectable()
export class DeviceUsersService {
  constructor(
    @Inject('DEVICE_USERS_REPOSITORY')
    private deviceUsersRepository: typeof DeviceUsers,
  ) { }

  async findOne(deviceName: string): Promise<DeviceUsersDto> {
    const deviceUser = await this.deviceUsersRepository.findOne({
      where: {
        DeviceName: deviceName
      },
    });

    if(deviceUser) {
      const deviceUsersDto = DeviceTransformerDto.toDeviceUserDto(deviceUser);
      return deviceUsersDto;
    }

    return null;
  }
}
