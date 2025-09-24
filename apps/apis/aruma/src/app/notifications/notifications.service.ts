import {
  Injectable,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeviceUsersService } from '../device-users/device-users.service';
import { EnvConstants } from '../../../env/env-constants';
import { SESEmailService } from '@app/email-service/ses-email-service.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly sesMessageQueue: SESEmailService,
    private readonly deviceUsersService: DeviceUsersService
  ) { }

  async getClientWebhook(
    deviceName: string
  ) {
    return this.deviceUsersService.getClientWebhook(
      deviceName
    );
  }

  async getNotificationSubscriptionBody(
    eventId: string,
    frequency: string,
    deviceName: string
  ) {
    const webhookUrl = `${this.configService.get(EnvConstants.WEBHOOK_NOTIFICATION_URL)}/${deviceName}`;
    const notificationSignagure = this.configService.get(EnvConstants.NOTIFICATION_SIGNATURE);
    const notificationBasicAuth = this.configService.get(EnvConstants.NOTIFICATION_BASIC_AUTH);

    return {
      event_id: eventId,
      webhook_url: webhookUrl,
      frequency: frequency,
      signature: notificationSignagure,
      basic_auth: notificationBasicAuth,
      algorithm: "SHA256"
    }
  }

  async setClientWebhook(
    deviceName: string,
    url: string,
    basicAuth: string
  ) {
    if (!url) {
      this.logger.error(`${deviceName} tried to setup notifications webhook without providing an url`);

      return {
        success: false,
        errors: [`Webhook url is a mandatory parameter.`]
      }
    }

    return this.deviceUsersService.createUpdateClientWebhook(
      deviceName,
      url,
      basicAuth
    );
  }

  async setClientWebhookPassword(
    deviceName: string,
    basicAuth: string
  ) {
    if (!basicAuth) {
      this.logger.error(`${deviceName} tried to setup notifications webhook password without the basic_auth property.`);

      return {
        success: false,
        errors: [`Webhook password is a mandatory parameter.`]
      }
    }

    return this.deviceUsersService.createUpdateClientWebhookPassword(
      deviceName,
      basicAuth
    );
  }

  async sendNotificationToClient(
    deviceName: string,
    notificatonBody: object,
    eventId: string
  ) {
    const deviceUser = await this.deviceUsersService.findOne(
      deviceName
    );

    if (
      deviceUser != null &&
      deviceUser.WebhookUrl != null && deviceUser.WebhookUrl != '' &&
      deviceUser.WebhookBasicAuth != null && deviceUser.WebhookBasicAuth != ''
    ) {
      const requestOptions = {
        method: 'POST',
        body: JSON.stringify(notificatonBody),
        headers: {
          'content-type': 'application/json',
          'basicauth': deviceUser.WebhookBasicAuth,
          'event_id': eventId
        }
      };

      let response;

      try {
        response = await fetch(
          deviceUser.WebhookUrl,
          requestOptions
        );
      } catch (error) {
        this.logger.fatal({
          message: `Error sending notification to client webhook!`,
          deviceUser: deviceUser,
          error: error
        });
      }

      try {
        if (requestOptions.body) {
          const parsedBody = JSON.parse(requestOptions.body);
          const objectKeys = Object.keys(parsedBody);

          if (objectKeys.length > 0) {
            requestOptions.body = parsedBody;
          }
        }
      } catch (error) {
        this.logger.error({
          message: `Invalid JSON in request body: ${JSON.stringify(requestOptions.body)}`,
          error: error
        });
      }

      if (response?.ok) {
        this.logger.log(
          {
            message: `Notification received for ${deviceName}`,
            webhookUrl: deviceUser.WebhookUrl,
            options: requestOptions,
            result: await response.json()
          }
        );
      } else if (response) {
        let webhookResponse;
        const responseCode = response.status;
        const text = await response.text();
        try {
          webhookResponse = JSON.parse(text);
        } catch (e) {
          webhookResponse = text;
        }
        this.logger.fatal({
          message: `Error sending notification to client's webhook for ${deviceName}`,
          webhookUrl: deviceUser.WebhookUrl,
          webhookBasicAuth: deviceUser.WebhookBasicAuth,
          options: requestOptions,
          responseCode: responseCode,
          clientWebhookResponse: [webhookResponse]
        });
      }
    } else {
      this.logger.error(
        {
          message: `A notification was received, but the client's webhook is not properly configured.`,
          deviceUser: deviceUser,
          notificatonBody: notificatonBody
        }
      );
    }

    if (
      deviceUser?.SendEmailOnNotification &&
      deviceUser?.Email != null &&
      deviceUser?.Email != ''
    ) {
      this.sesMessageQueue.sendEmailWithAttachment(
        [deviceUser.Email],
        this.configService.get(EnvConstants.NOTIFICATION_FROM_EMAIL),
        'NOTIFICATION - ' + eventId,
        notificatonBody
      );
    }
  }

  private async getMailTemplate() {
    return `<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event Notification</title>
    </head>
    <body>
        Hello Provider,
        <br>
        <br>
        {{eventDetails}}
        <br>
        Thank you for choosing us
        <br>
        <br>
        NDIA Integration Module
        <br>
        {{signatureEmail}}
    </body>
    </html>`;
  }

  private async getEmailBody(
    deviceName: string,
    body: unknown,
    isLummary: boolean,
  ) {
    const template = await this.getMailTemplate();

    const eventDetails = this.getProperties(body);

    let signatureEmail = '';
    if (isLummary) {
      signatureEmail = `<a href='https://lumary.com/'>Lumary</a> - Better Wellbeing Through Technology<br>`;
    }

    signatureEmail += `<a href='https://yourcareaccess.com.au/'>Care Access</a> - Connecting disability providers to the NDIA`;

    const htmlString = template
      .replace('{{eventDetails}}', eventDetails)
      .replace('{{signatureEmail}}', signatureEmail);

    return htmlString;
  }

  private getProperties(body, indentacao = 0) {
    let result = '';
    const space = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(indentacao);
    for (const property in body) {
      if (typeof body[property] === 'object') {
        result += `${space}- ${property}:<br>`;
        console.log();
        result += this.getProperties(body[property], indentacao + 1);
      } else {
        result += `${space}- ${property}: ${body[property]}<br>`;
      }
    }
    return result;
  }

  private isValid(field) {
    return field !== null && field !== undefined && field.trim() !== '';
  }
}
