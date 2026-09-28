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
] as const;
export const chatCapability: Record<string, string> = {
  CREATE: 'chat.create',
  ACCESS_ADMIN: 'chat.access.manage',
  LOCK: 'chat.lock',
  HISTORY: 'chat.history',
  PUBLISH: 'chat.publish',
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
  @ArrayMaxSize(5)
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
  @IsUUID() sourceId!: string;
  @IsUUID() fileId!: string;
  @IsInt() @Min(1) version!: number;
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
