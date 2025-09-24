export interface NDISInterface {
  sendRequest(
    method: string,
    path: string,
    extraHeaders: object,
    customerName: string,
    deviceName: string,
    requestBody: unknown,
    queryObject: object,
    saveTransaction: boolean
  ): Promise<Response>
}