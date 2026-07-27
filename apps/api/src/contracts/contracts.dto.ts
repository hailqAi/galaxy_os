import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class CreateContractDto {
  @IsUUID() quotationId!: string;
  @IsString() @Length(1, 100) contractNumber!: string;
  @IsString() sellerLegalEntity!: string;
  @IsString() buyerLegalEntity!: string;
  @IsOptional() @IsString() sellerRepresentative?: string;
  @IsOptional() @IsString() buyerRepresentative?: string;
  @IsOptional() @Type(() => Date) @IsDate() expectedCompletionDate?: Date;
  @IsOptional() @IsNumberString() retentionPercent?: string;
  @IsOptional() @IsNumberString() warrantyRetentionPercent?: string;
  @IsOptional() @IsString() terminationTerms?: string;
}
export class ContractTransitionDto {
  @IsIn([
    'INTERNAL_REVIEW',
    'NEGOTIATION',
    'SIGNED',
    'ACTIVE',
    'SUSPENDED',
    'COMPLETED',
    'TERMINATED',
    'CANCELLED',
  ])
  status!: string;
  @IsOptional() @Type(() => Date) @IsDate() signedDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() effectiveDate?: Date;
  @IsOptional() @IsString() comment?: string;
}
export class CreateAppendixDto {
  @IsString() appendixNumber!: string;
  @IsIn([
    'VALUE_INCREASE',
    'VALUE_DECREASE',
    'ADD_SCOPE',
    'REMOVE_SCOPE',
    'PRODUCT_CHANGE',
    'SCHEDULE_CHANGE',
    'PAYMENT_CHANGE',
    'OTHER',
  ])
  type!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumberString() valueChange!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsString() @Length(8, 200) idempotencyKey!: string;
}
export class AppendixTransitionDto {
  @IsIn([
    'INTERNAL_REVIEW',
    'APPROVED',
    'SIGNED',
    'EFFECTIVE',
    'REJECTED',
    'CANCELLED',
  ])
  status!: string;
  @IsOptional() @Type(() => Date) @IsDate() effectiveDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() signedDate?: Date;
}
export class PaymentScheduleItemDto {
  @IsString() milestoneName!: string;
  @Type(() => Date) @IsDate() dueDate!: Date;
  @IsNumberString() amount!: string;
  @IsOptional() @IsNumberString() percentage?: string;
  @IsOptional() @IsString() condition?: string;
}
export class CreatePaymentSchedulesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleItemDto)
  items!: PaymentScheduleItemDto[];
}
export class PaymentAllocationDto {
  @IsUUID() scheduleId!: string;
  @IsNumberString() amount!: string;
}
export class RecordPaymentDto {
  @Type(() => Date) @IsDate() paymentDate!: Date;
  @IsNumberString() amount!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsNumberString() exchangeRate?: string;
  @IsIn(['BANK_TRANSFER', 'CASH', 'OFFSET', 'RETENTION_RELEASE', 'OTHER'])
  paymentMethod!: string;
  @IsOptional() @IsString() bankReference?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() notes?: string;
  @IsString() @Length(8, 200) idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class CreateGuaranteeDto {
  @IsIn(['ADVANCE_PAYMENT', 'PERFORMANCE', 'WARRANTY', 'RETENTION', 'OTHER'])
  type!: string;
  @IsString() guaranteeNumber!: string;
  @IsString() bank!: string;
  @IsString() beneficiary!: string;
  @IsNumberString() value!: string;
  @IsString() @Length(3, 3) currency!: string;
  @Type(() => Date) @IsDate() issueDate!: Date;
  @Type(() => Date) @IsDate() expiryDate!: Date;
}
