import {
  Inject,
  Injectable
} from '@nestjs/common';
import { FieldCryptoService } from '@app/database/crypto/field-crypto.service';
import { DeviceUsers } from '@app/database/entities/device-users.entity';
import { DeviceUsersDto } from './dto/device-users.dto';
import { DeviceTransformerDto } from '../dto/transformer/device-users-transformer.dto';

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

  async getClientWebhook(
    deviceName: string
  ) {
    const deviceUser = await this.deviceUsersRepository.findOne(
      {
        attributes: ['WebhookUrl','WebhookBasicAuth'],
        where: {
          DeviceName: deviceName
        }
      }
    )

    const result = {
      url: null,
      basic_auth: false
    };

    if(deviceUser.WebhookUrl != null && deviceUser.WebhookUrl != '') {
      result.url = deviceUser.WebhookUrl;
    }

    if(deviceUser.WebhookBasicAuth != null && deviceUser.WebhookBasicAuth != '') {
      result.basic_auth = true;
    }

    return result;
  }

  async createUpdateClientWebhook(
    deviceName: string,
    webhook: string,
    basicAuth: string
  ) {
    return await this.deviceUsersRepository.update(
      {
        WebhookUrl: webhook,
        WebhookBasicAuth: this.fieldCrypto.encrypt(basicAuth)
      },
      {
        where: {
          DeviceName: deviceName
        }
      }
    )
  }

  async createUpdateClientWebhookPassword(
    deviceName: string,
    basicAuth: string
  ) {
    return await this.deviceUsersRepository.update(
      {
        WebhookBasicAuth: this.fieldCrypto.encrypt(basicAuth)
      },
      {
        where: {
          DeviceName: deviceName
        }
      }
    )
  }
}
