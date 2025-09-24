
export interface EmailService {
    sendEmail(
        toAddresses: string[],
        fromAddress: string,
        emailMessage: string,
        subject: string,
        ccAddreesses: string[],
        bccAddresses: string[]
    ): Promise<void>;
}
