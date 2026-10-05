import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

export const roomActions = [
  'READ',
  'SEND',
  'UPLOAD',
  'DOWNLOAD',
  'LOCK',
  'HISTORY',
] as const;
export const authorityActions = [
  'CREATE',
  'ACCESS_ADMIN',
  'LOCK',
  'HISTORY',
  'PUBLISH',
  'INVOKE',
] as const;
export const chatCapability: Record<string, string> = {
  CREATE: 'chat.create',
  ACCESS_ADMIN: 'chat.access.manage',
  LOCK: 'chat.lock',
  HISTORY: 'chat.history',
  PUBLISH: 'chat.publish',
  INVOKE: 'ai.invoke',
  READ: 'chat.read',
  SEND: 'chat.send',
  UPLOAD: 'chat.upload',
  DOWNLOAD: 'chat.download',
};
export class ChatLockDto {
  @IsBoolean() locked!: boolean;
}
export class ChatHistoryDto {
  @Type(() => Date) @IsDate() from!: Date;
  @Type(() => Date) @IsDate() to!: Date;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(2)
  @IsIn(['READ', 'DOWNLOAD'], { each: true })
  actions!: string[];
}
export class ChatAuthorityDto {
  @IsUUID() userId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsIn(authorityActions, { each: true })
  actions!: string[];
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsIn(roomActions, { each: true })
  roomCeiling!: string[];
  @IsOptional() @Type(() => Date) @IsDate() expiresAt?: Date;
}
export class ChatParticipantDto {
  @IsUUID() userId!: string;
}
export class ChatRenewDto {
  @Type(() => Date) @IsDate() expiresAt!: Date;
}
export class ChatRoomDto {
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsUUID() productLineId?: string;
  @IsString() @Length(1, 120) title!: string;
  @IsIn(['CONSULTING', 'COMMERCIAL', 'SUPPLY', 'AFTER_SALES']) group!: string;
  @IsIn(['INTERNAL', 'CUSTOMER']) audience!: string;
}
export class ChatGrantDto {
  @IsUUID() userId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(6)
  @IsIn(roomActions, { each: true })
  actions!: string[];
  @IsOptional() @Type(() => Date) @IsDate() expiresAt?: Date;
}
export class ChatMessageDto {
  @IsUUID() clientKey!: string;
  @IsString() @Length(1, 8000) body!: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
export class ChatUploadDto {
  @IsUUID() clientKey!: string;
}
export class ChatReleaseDto {
  @IsOptional()
  @IsIn([
    'PROPOSAL',
    'QUOTATION',
    'TECHNICAL',
    'SAMPLE',
    'HANDOVER',
    'CONTRACT',
    'CONTRACT_FILE',
    'PAYMENT',
    'CUSTOMER_PAYMENT_RECORD',
    'CUSTOMER_PAYMENT_FILE',
    'SITE_DELIVERY',
    'DELIVERY_INSTALL',
  ])
  sourceType?:
    | 'PROPOSAL'
    | 'QUOTATION'
    | 'TECHNICAL'
    | 'SAMPLE'
    | 'HANDOVER'
    | 'CONTRACT'
    | 'CONTRACT_FILE'
    | 'PAYMENT'
    | 'CUSTOMER_PAYMENT_RECORD'
    | 'CUSTOMER_PAYMENT_FILE'
    | 'SITE_DELIVERY'
    | 'DELIVERY_INSTALL';
  @IsUUID() sourceId!: string;
  @IsOptional() @IsUUID() fileId?: string;
  @ValidateIf(
    (o: ChatReleaseDto) =>
      ![
        'CONTRACT',
        'PAYMENT',
        'CUSTOMER_PAYMENT_RECORD',
        'DELIVERY_INSTALL',
      ].includes(o.sourceType ?? '') || o.version !== undefined,
  )
  @IsInt()
  @Min(1)
  version!: number;
  @IsOptional() @IsUUID() appendixId?: string;
  @IsOptional()
  @IsIn(['CUSTOMER_REVIEW_FILE', 'RECORDED_SIGNED_COPY'])
  purpose?: 'CUSTOMER_REVIEW_FILE' | 'RECORDED_SIGNED_COPY';
  @IsOptional() @IsUUID() clientKey?: string;
  @IsOptional() @Matches(/^[0-9a-f]{64}$/) sourceFingerprint?: string;
}
export class ChatCustomerFilesQuery {
  @IsUUID() sourceId!: string;
  @IsOptional() @IsUUID() appendixId?: string;
  @IsOptional()
  @IsIn(['CUSTOMER_REVIEW_FILE', 'RECORDED_SIGNED_COPY'])
  purpose?: 'CUSTOMER_REVIEW_FILE' | 'RECORDED_SIGNED_COPY';
}
export class ChatPublishDto {
  @IsIn([true]) confirmed!: boolean;
  @IsOptional() @IsString() @Length(64, 64) recipientHash?: string;
}
export class ChatMessagesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) after?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class ChatAiContextDto {
  @IsOptional() @IsUUID('4') roomId?: string;
  @IsOptional() @IsUUID('4') productLineId?: string;
  @IsOptional() @IsUUID('4') fileAssetId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) fileVersion?: number;
}
export class ChatAiScopeDto extends ChatAiContextDto {
  @IsIn(['ALL', 'CONSULTING', 'COMMERCIAL', 'SUPPLY', 'AFTER_SALES'])
  scope!: string;
}
export class ChatAiConversationDto {
  @IsIn(['ALL', 'CONSULTING', 'COMMERCIAL', 'SUPPLY', 'AFTER_SALES'])
  scope!: string;
  @IsUUID('4') clientKey!: string;
}
export class ChatAiQuestionDto extends ChatAiContextDto {
  @IsOptional() @IsIn(['GENERAL', 'PROJECT']) mode?: 'GENERAL' | 'PROJECT';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sourceIds?: string[];
  @IsOptional()
  @IsIn([
    'gemini-3.8-flash',
    'mistral-medium-3-5',
    'kira-3.5-pro',
    'openrouter/free',
  ])
  model?: string;
  @IsOptional()
  @IsIn(['default', 'none', 'low', 'medium', 'high'])
  reasoning?: string;
  @IsOptional()
  @IsIn(['SYNTHETIC_PUBLIC_APPROVED'])
  dataClassification?: string;
  @IsUUID('4') clientKey!: string;
  @IsString() @Length(1, 8000) question!: string;
}

export class ChatAiEgressDto {
  @IsIn([
    'gemini-3.8-flash',
    'mistral-medium-3-5',
    'kira-3.5-pro',
    'openrouter/free',
  ])
  model!: string;
  @IsIn(['INPUT', 'SOURCE', 'PROJECT']) kind!: 'INPUT' | 'SOURCE' | 'PROJECT';
  @IsIn(['APPROVE', 'REVOKE']) action!: 'APPROVE' | 'REVOKE';
  @IsIn([true]) confirmed!: boolean;
  @IsOptional() @IsString() @Length(1, 8000) question?: string;
  @IsOptional() @IsUUID('4') sourceId?: string;
  @IsOptional() @IsString() @Length(1, 200) version?: string;
}

export class ChatAiActivationDto {
  @IsIn([
    'gemini-3.8-flash',
    'mistral-medium-3-5',
    'kira-3.5-pro',
    'openrouter/free',
  ])
  model!: string;
  @IsIn(['text', 'image', 'pdf']) capability!: 'text' | 'image' | 'pdf';
  @IsUUID('4') clientKey!: string;
}
