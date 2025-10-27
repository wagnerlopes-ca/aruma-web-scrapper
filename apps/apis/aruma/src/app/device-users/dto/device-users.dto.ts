import { DeviceCertificateDto } from "./device-certificate.dto";
import { DeviceTokenDto } from "./device-token.dto";

export class DeviceUsersDto {
    DeviceName: string;
    IsActive: boolean;
    ClientName: string;
    Customer: string;
    Email: string;
    SendEmailOnNotification: boolean;
    Password: string;
    OrganizationId: string;
    ClientId: string;
    Certificate: DeviceCertificateDto;
    Token: DeviceTokenDto;
    WebhookUrl: string;
    WebhookBasicAuth: string;
}