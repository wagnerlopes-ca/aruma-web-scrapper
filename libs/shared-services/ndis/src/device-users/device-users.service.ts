import {
  Inject,
  Injectable
} from '@nestjs/common';
import { FieldCryptoService } from '@app/database/crypto/field-crypto.service';
import { DeviceUsers } from '../../../../database/src/entities/device-users.entity'
import { DeviceUsersDto } from './dto/device-users.dto';
import { DeviceTransformerDto } from './transformer/device-users-transformer.dto';

@Injectable()
export class DeviceUsersService {
  constructor(
    @Inject('DEVICE_USERS_REPOSITORY')
    private deviceUsersRepository: typeof DeviceUsers,
    private readonly fieldCrypto: FieldCryptoService,
  ) { }

  async findOne(deviceName: string): Promise<DeviceUsersDto> {
    const deviceUser = await this.deviceUsersRepository.findOne({
      where: {
        DeviceName: deviceName
      },
    });

    if(deviceUser) {
      deviceUser.Certificate = this.fieldCrypto.decrypt(deviceUser.Certificate);
      deviceUser.Token = this.fieldCrypto.decrypt(deviceUser.Token);
      deviceUser.WebhookBasicAuth = this.fieldCrypto.decrypt(
        deviceUser.WebhookBasicAuth,
      );
      const deviceUsersDto = DeviceTransformerDto.toDeviceUserDto(deviceUser);
      return deviceUsersDto;
    }

    return null;
  }
}
