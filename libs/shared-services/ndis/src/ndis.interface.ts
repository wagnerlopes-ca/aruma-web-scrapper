import { DeviceUsersDto } from "./device-users/dto/device-users.dto";

export interface NDISInterface {
  sendRequest(
    method: string,
    path: string,
    extraHeaders: object,
    deviceName: string,
    requestBody: unknown,
    deviceUserDto: DeviceUsersDto
  ): Promise<Response>
}