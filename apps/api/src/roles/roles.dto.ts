import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
  Max,
} from 'class-validator';

export class CreateRoleDto {
  @IsString() @Matches(/^[a-z0-9_]+$/) @Length(1, 40) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsBoolean() isDelegable?: boolean;
  @IsOptional() @IsBoolean() isSystem?: boolean;
  @IsOptional() @IsBoolean() isProtected?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) administrationTier?: number;
  @IsOptional()
  @IsIn(['SYSTEM', 'ORGANIZATION', 'DEPARTMENT', 'SELF'])
  maximumScope?: 'SYSTEM' | 'ORGANIZATION' | 'DEPARTMENT' | 'SELF';
  @IsOptional()
  @IsIn([
    'SYSTEM',
    'ORGANIZATION',
    'EXECUTIVE',
    'DEPARTMENT',
    'STANDARD',
    'CUSTOM',
  ])
  category?:
    | 'SYSTEM'
    | 'ORGANIZATION'
    | 'EXECUTIVE'
    | 'DEPARTMENT'
    | 'STANDARD'
    | 'CUSTOM';
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @Length(1, 40)
  code?: string;
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsBoolean() isDelegable?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) administrationTier?: number;
  @IsOptional() @IsIn(['ORGANIZATION', 'DEPARTMENT', 'SELF']) maximumScope?:
    | 'ORGANIZATION'
    | 'DEPARTMENT'
    | 'SELF';
  @IsOptional()
  @IsIn(['ORGANIZATION', 'EXECUTIVE', 'DEPARTMENT', 'STANDARD', 'CUSTOM'])
  category?:
    | 'ORGANIZATION'
    | 'EXECUTIVE'
    | 'DEPARTMENT'
    | 'STANDARD'
    | 'CUSTOM';
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
