export class DeviceCertificateDto {
  PublicKey: {
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n: string;
    e: string;
  };
  PrivateKey: {
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n: string;
    e: string;
    d: string;
    p: string;
    q: string;
    dp: string;
    dq: string;
    qi: string;
  };

  static parseFromString(jsonString: string): DeviceCertificateDto {
    try {
      const parsedJson = JSON.parse(jsonString);
      const deviceCertificateDto = new DeviceCertificateDto();

      deviceCertificateDto.PublicKey = { ...parsedJson.PublicKey };
      deviceCertificateDto.PrivateKey = { ...parsedJson.PrivateKey };

      return deviceCertificateDto;
    } catch (err) {
      let deviceCertificateDto;
      if (jsonString) {

        deviceCertificateDto = this.tryParseWithJitterBitBackwardCompatibilityModel(jsonString);
      }

      return deviceCertificateDto;
    }
  }

  private static tryParseWithJitterBitBackwardCompatibilityModel(jitterBitModelJson): DeviceCertificateDto {

    const jsonStringModified: string = jitterBitModelJson.replace(/"{/g, '{').replace(/}"/g, '}');

    const parsedJson = JSON.parse(jsonStringModified);
    const deviceCertificateDto = new DeviceCertificateDto();

    deviceCertificateDto.PublicKey = { ...parsedJson.PublicKey };
    deviceCertificateDto.PrivateKey = { ...parsedJson.PrivateKey };

    return deviceCertificateDto;
  }
}