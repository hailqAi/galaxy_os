import { Type } from 'class-transformer';
import { z } from 'zod';
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

const memoryLocator = z
  .object({
    page: z.number().int().positive().max(1000000).optional(),
    sheet: z.string().min(1).max(200).optional(),
    range: z
      .string()
      .regex(/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/)
      .max(80)
      .optional(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.endLine === undefined ||
      (v.startLine !== undefined && v.endLine >= v.startLine),
  );
const memoryRef = {
  id: z.string().uuid(),
  version: z.string().min(1).max(200),
};
export const memorySourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...memoryRef,
      kind: z.literal('AI_ANSWER'),
      locator: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...memoryRef,
      kind: z.literal('CHAT_MESSAGE'),
      locator: memoryLocator,
    })
    .strict(),
  z
    .object({
      ...memoryRef,
      kind: z.literal('FILE_INDEX'),
      locator: memoryLocator,
    })
    .strict(),
  z
    .object({
      ...memoryRef,
      kind: z.literal('TASK'),
      locator: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      ...memoryRef,
      kind: z.literal('PROJECT_RECORD'),
      locator: z
        .object({
          view: z.literal('stage_two_plan'),
          includeFinancial: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...memoryRef,
      kind: z.literal('MEMORY_REVISION'),
      locator: z.object({}).strict(),
    })
    .strict(),
]);
const memoryContent = {
  clientKey: z.string().uuid(),
  content: z
    .string()
    .min(1)
    .max(8000)
    .refine((v) => Boolean(v.trim()) && !v.includes('\0')),
  category: z.enum(['NOTE', 'REQUIREMENT', 'TECHNICAL', 'DECISION', 'ISSUE']),
  verification: z.enum(['UNVERIFIED', 'USER_CONFIRMED']),
  sourceRefs: z.array(memorySourceSchema).max(20).default([]),
};
export const memoryWriteSchema = z
  .object({
    ...memoryContent,
    visibility: z.enum(['PRIVATE', 'SHARED']),
    publishFrom: z
      .object({
        memoryId: z.string().uuid(),
        version: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => !v.publishFrom || v.visibility === 'SHARED');
export const memoryChangeSchema = z
  .object({ ...memoryContent, expectedVersion: z.number().int().positive() })
  .strict();
export const memoryInactiveSchema = z
  .object({
    clientKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const memoryQuerySchema = z
  .object({
    visibility: z.enum(['PRIVATE', 'SHARED', 'ALL']).default('ALL'),
    query: z.string().max(200).optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const memoryReadSchema = z
  .object({ version: z.coerce.number().int().positive().optional() })
  .strict();
export type MemorySourceRef = z.infer<typeof memorySourceSchema>;
export type MemoryWriteInput = z.infer<typeof memoryWriteSchema>;
export type MemoryChangeInput = z.infer<typeof memoryChangeSchema>;
export type MemoryInactiveInput = z.infer<typeof memoryInactiveSchema>;
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;

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
export const chatAiPromoteSchema = z
  .object({
    definitionId: z.string().uuid(),
    sourceVersion: z.string().min(1).max(200),
    clientKey: z.string().uuid(),
  })
  .strict();
export class ChatAiResumeDto {
  @IsOptional() @IsIn(['xlsx', 'docx', 'pdf', 'pptx']) outputFormat?:
    | 'xlsx'
    | 'docx'
    | 'pdf'
    | 'pptx';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sourceIds?: string[];
}
export class ChatAiQuestionDto extends ChatAiContextDto {
  @IsOptional() @IsIn(['xlsx', 'docx', 'pdf', 'pptx']) outputFormat?:
    | 'xlsx'
    | 'docx'
    | 'pdf'
    | 'pptx';
  @IsOptional() @IsIn(['NORMAL', 'DEEP']) runMode?: 'NORMAL' | 'DEEP';
  @IsOptional() @IsBoolean() webSearch?: boolean;
  @IsOptional()
  @IsIn(['AUTO', 'WEB', 'PROJECT_ONLY'])
  searchMode?: 'AUTO' | 'WEB' | 'PROJECT_ONLY';
  @IsOptional()
  @IsString()
  @Length(1, 400)
  @Matches(/\S/)
  publicQuery?: string;
  @IsOptional() @IsIn(['GENERAL', 'PROJECT']) mode?: 'GENERAL' | 'PROJECT';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  sourceIds?: string[];
  @IsOptional()
  @IsString()
  @Length(1, 200)
  model?: string;
  @IsOptional()
  @IsIn(['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'])
  reasoning?: string;
  @IsOptional()
  @IsIn(['SYNTHETIC_PUBLIC_APPROVED'])
  dataClassification?: string;
  @IsUUID('4') clientKey!: string;
  @IsString() @Length(1, 256000) question!: string;
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
