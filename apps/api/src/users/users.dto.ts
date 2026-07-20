import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 120) displayName!: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @IsIn(['invited', 'active']) status?: 'invited' | 'active';
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(1, 120) displayName?: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @IsIn(['active']) status?: 'active';
}

class DepartmentAssignmentDto {
  @IsUUID() departmentId!: string;
  @IsBoolean() isPrimary!: boolean;
}

export class SetUserDepartmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentAssignmentDto)
  departments!: DepartmentAssignmentDto[];
}

export class SetUserRolesDto {
  @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) roleIds!: string[];
}

export class UpdateMembershipDto {
  @IsIn(['active', 'disabled']) status!: 'active' | 'disabled';
}
