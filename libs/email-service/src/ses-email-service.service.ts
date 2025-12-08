import { Injectable, Logger } from '@nestjs/common';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { EmailService } from './email-service.service';
import { EnvConstants } from '../env/env.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SESEmailService implements EmailService {
  private readonly logger = new Logger(SESEmailService.name);
  private client = new SESClient({ region: "ap-southeast-2" });

  constructor(private configService: ConfigService) { }

  private createSendEmailCommand(
    toAddresses: string[],
    fromAddress: string,
    emailMessage: string,
    subject: string,
    ccAddreesses: string[],
    bccAddresses: string[],
  ): SendEmailCommand {
    return new SendEmailCommand({
      Destination: {
        CcAddresses: ccAddreesses,
        ToAddresses: toAddresses,
        BccAddresses: bccAddresses
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: emailMessage,
          },
          Text: { //TODO: Validar se precisa passar algo nesse campo ou se vamos sempre usar o html.
            Charset: "UTF-8",
            Data: "",
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: subject,
        },
      },
      Source: fromAddress,
      ReplyToAddresses: [fromAddress],
    });
  }

  async sendEmail(
    toAddresses: string[],
    fromAddress: string,
    emailMessage: string,
    subject: string,
    ccAddreesses: string[],
    bccAddresses: string[]
  ): Promise<void> {
    const sendEmailCommand = this.createSendEmailCommand(
      toAddresses,
      fromAddress,
      emailMessage,
      subject,
      ccAddreesses,
      bccAddresses
    );

    try {
      this.client.send(sendEmailCommand);
      this.logger.log(`Email message sent to AWS SES - ${toAddresses}`);
    } catch (e) {
      this.logger.error(`Error to send email message - ${e.message}`);
    }
  }

  private createSendRawEmailContent(
    toAddresses: string[],
    fromAddress: string,
    subject: string,
    attachment: object
  ): string {
    //const configService = new ConfigService();
    const fileName = "Notification.txt";

    const maxAttachmentSizeToParse = Number(this.configService.get(EnvConstants.MAX_NOTIFICATION_PAYLOAD_SIZE_TO_PARSE)) || 5000;
    let emailBody;
    if (JSON.stringify(attachment).length <= maxAttachmentSizeToParse) {
      emailBody = this.objectToHtml(attachment);
    } else {
      emailBody = 'The notification is too large to be shown here. Check the attachment for the full payload.';
    }
    // Create the MIME email
    const boundaryMixed = "MixedBoundary123";
    const boundaryAlternative = "AlternativeBoundary456";

    return [
      `From: ${fromAddress}`,
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
      "",
      `--${boundaryMixed}`,
      `Content-Type: multipart/alternative; boundary="${boundaryAlternative}"`,
      "",
      // Plain text version
      `--${boundaryAlternative}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      "Notification Received. Check the attachments for the full payload.",
      "",
      // HTML version
      `--${boundaryAlternative}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      `<html>
        <body>
          <h2>Notification received:</h2>
          ${emailBody}
        </body>
      </html>`,
      "",
      `--${boundaryAlternative}--`,
      "",
      // Attachment
      `--${boundaryMixed}`,
      `Content-Type: text/plain; name="${fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${fileName}"`,
      "",
      Buffer.from(JSON.stringify(attachment)).toString("base64"), ,
      "",
      `--${boundaryMixed}--`
    ].join("\r\n");
  }

  async sendEmailWithAttachment(
    toAddresses: string[],
    fromAddress: string,
    subject: string,
    attachment: object
  ): Promise<void> {
    // try {
    //   const rawEmail = this.createSendRawEmailContent(
    //     toAddresses,
    //     fromAddress,
    //     subject,
    //     attachment
    //   );

    //   const command = new SendRawEmailCommand({
    //     RawMessage: { Data: Buffer.from(rawEmail) },
    //   });
    //   const response = await this.client.send(command);

    //   this.logger.log(
    //     {
    //       message: `Email sent to: ${toAddresses}`,
    //       rawEmail: rawEmail.length < 5000 ? rawEmail : 'Too large to log',
    //       response: response
    //     }
    //   )

    //   this.logger.log(`Email message sent to AWS SES - ${toAddresses}`);
    // } catch (e) {
    //   this.logger.error(`Error to send email message - ${e.message}`);
    // }
  }

  private objectToHtml(data: object) {
    let html = '';

    // Handle different data types
    if (data === null || data === undefined) {
      return `<li><span style="color: gray;">null</span></li>\n`;
    }
    if (typeof data === 'string') {
      return `<span>${data}</span>`;
    }
    if (typeof data === 'number' || typeof data === 'boolean') {
      return `<span>${data}</span>`;
    }
    if (Array.isArray(data)) {
      html += `<ul>`;
      data.forEach((item, index) => {
        html += `<li><strong>Item ${index + 1}:</strong> ` + this.objectToHtml(item) + '</li>';
      });
      html += `</ul>`;
      return html;
    }
    if (typeof data === 'object') {
      html += `<ul>`;
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          html += `<li>`;
          html += `<strong>${key}:</strong> ${this.objectToHtml(data[key])}`;
          html += `</li>`;
        }
      }
      html += `</ul>`;
      return html;
    }
    return `<li><span>Unsupported type</span></li>\n`;
  }
}
