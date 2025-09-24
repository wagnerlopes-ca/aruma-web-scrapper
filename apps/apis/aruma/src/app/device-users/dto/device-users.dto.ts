import { DeviceCertificateDto } from "./device-certificate.dto";
import { DeviceTokenDto } from "./device-token.dto";

export class DeviceUsersDto {
    DeviceName: string;
    IsActive: boolean;
    ClientName: string;
    Email: string;
    SendEmailOnNotification: boolean;
    Password: string;
    OrganizationId: string;
    Certificate: DeviceCertificateDto;
    Token: DeviceTokenDto;
    WebhookUrl: string;
    WebhookBasicAuth: string;
}