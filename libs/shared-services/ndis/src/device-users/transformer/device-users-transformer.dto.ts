import { DeviceCertificateDto } from '../dto/device-certificate.dto';
import { DeviceTokenDto } from '../dto/device-token.dto';
import { Logger } from '@nestjs/common';
import { DeviceUsers } from '@app/database/entities/device-users.entity';
import { DeviceUsersDto } from '../../device-users/dto/device-users.dto';

export class DeviceTransformerDto {
  private static logger = new Logger(DeviceTransformerDto.name);

  public static toDeviceUserDto(
    deviceUser: DeviceUsers
  ) : DeviceUsersDto {
    const deviceUsersDto: DeviceUsersDto = {
      DeviceName: deviceUser.DeviceName,
      ClientName: deviceUser.ClientName,
      Customer: deviceUser.Customer,
      Password: deviceUser.Password,
      OrganizationId: deviceUser.OrganizationId,
      ClientId: deviceUser.ClientId,
      Certificate: this.toDeviceCertificateDto(deviceUser.Certificate),
      Token: this.toDeviceTokenDto(deviceUser.Token),
      WebhookUrl: deviceUser.WebhookUrl,
      WebhookBasicAuth: deviceUser.WebhookBasicAuth,
    }

    return deviceUsersDto;
  }

  public static toDeviceTokenDto(
    contents: string,
  ): DeviceTokenDto {
    try {
      if (!contents) {
        return null;
      }
      return DeviceTokenDto.parseFromString(contents);
    } catch (error) {
      this.logger.error(`Error to parse contents to DeviceTokenDto.`);
      return null;
    }
  }

  public static toDeviceCertificateDto(contents: string): DeviceCertificateDto {
    try {
      if (!contents) {
        return null;
      }
      return DeviceCertificateDto.parseFromString(contents);
    } catch (error) {
      this.logger.error(`Error to parse contents to DeviceCertificateDto.`);
      return null;
    }
  }
}
