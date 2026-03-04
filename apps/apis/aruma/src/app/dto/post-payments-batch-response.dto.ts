import { RequestDto } from "./request.dto";

export class PostPaymentsBatchResponseDto {
    batch_reference_name: string;
    response: RequestDto;
}