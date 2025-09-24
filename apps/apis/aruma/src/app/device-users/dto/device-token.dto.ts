export class DeviceTokenDto {
   access_token: string;
   scope: string;
   device_expiry: string;
   key_expiry: string;
   token_type: string;
   expires_in: string;

   static parseFromString(jsonString: string): DeviceTokenDto {
      const parsedJson = JSON.parse(jsonString);
      const deviceTokenDto = new DeviceTokenDto();
      Object.assign(deviceTokenDto, parsedJson);

      return deviceTokenDto;
   }
}