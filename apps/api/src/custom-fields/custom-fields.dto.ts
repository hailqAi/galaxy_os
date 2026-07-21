import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

const entityTypes = [
  'USER',
  'ORGANIZATION_MEMBER',
  'DEPARTMENT',
  'ROLE',
] as const;
const dataTypes = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'EMAIL',
  'PHONE',
  'URL',
] as const;

export class CreateCustomFieldDto {
  @IsIn(['SYSTEM', 'ORGANIZATION']) scope!: 'SYSTEM' | 'ORGANIZATION';
  @IsIn(entityTypes) entityType!: (typeof entityTypes)[number];
  @IsString() @Matches(/^[a-z][a-z0-9_]*$/) @Length(1, 50) key!: string;
  @IsString() @Length(1, 120) label!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsIn(dataTypes) dataType!: (typeof dataTypes)[number];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() defaultValue?: unknown;
  @IsOptional() @IsArray() options?: unknown[];
  @IsOptional() @IsObject() validation?: Record<string, unknown>;
  @IsOptional() @IsString() visibilityPermission?: string;
  @IsOptional() @IsString() editPermission?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCustomFieldDto extends CreateCustomFieldDto {}

export class SetCustomValuesDto {
  @IsObject() values!: Record<string, unknown>;
}
