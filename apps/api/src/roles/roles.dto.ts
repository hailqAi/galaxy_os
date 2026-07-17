import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsString() @Matches(/^[a-z0-9_]+$/) @Length(1, 40) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  @Length(1, 40)
  code?: string;
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
