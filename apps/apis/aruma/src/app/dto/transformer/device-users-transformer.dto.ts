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
      IsActive: deviceUser.IsActive,
      ClientName: deviceUser.ClientName,
      Email: deviceUser.Email,
      SendEmailOnNotification: deviceUser.SendEmailOnNotification,
      Password: deviceUser.Password,
      OrganizationId: deviceUser.OrganizationId,
      Certificate: deviceUser.Certificate ? JSON.parse(deviceUser.Certificate) : null,
      Token: deviceUser.Token ? JSON.parse(deviceUser.Token) : null,
      WebhookUrl: deviceUser.WebhookUrl,
      WebhookBasicAuth: deviceUser.WebhookBasicAuth
    }

    return deviceUsersDto;
  }
}
