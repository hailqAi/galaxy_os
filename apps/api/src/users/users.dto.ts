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

class DepartmentAssignmentDto {
  @IsUUID() departmentId!: string;
  @IsBoolean() isPrimary!: boolean;
}

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @Length(1, 120) displayName!: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
  @IsOptional() @IsIn(['invited', 'active']) status?: 'invited' | 'active';
  @IsOptional() @IsString() @Length(12, 128) temporaryPassword?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds?: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentAssignmentDto)
  departments?: DepartmentAssignmentDto[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 120) displayName?: string;
  @IsOptional() @IsString() @Length(1, 30) phone?: string;
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

class ScopedRoleAssignmentDto {
  @IsUUID() roleId!: string;
  @IsIn(['SYSTEM', 'ORGANIZATION', 'DEPARTMENT', 'SELF']) scopeType!:
    | 'SYSTEM'
    | 'ORGANIZATION'
    | 'DEPARTMENT'
    | 'SELF';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

export class SetScopedRoleAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScopedRoleAssignmentDto)
  assignments!: ScopedRoleAssignmentDto[];
}

export class SetAccessProfileDto {
  @IsString() @Length(1, 120) name!: string;
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
  @IsIn(['ORGANIZATION', 'DEPARTMENT', 'SELF']) maximumScope!:
    | 'ORGANIZATION'
    | 'DEPARTMENT'
    | 'SELF';
  @IsOptional() @IsUUID() departmentId?: string;
}

export class UpdateMembershipDto {
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
  @IsOptional()
  @IsIn(['SELF', 'MANAGED_DEPARTMENTS', 'ORGANIZATION'])
  administrationScope?: 'SELF' | 'MANAGED_DEPARTMENTS' | 'ORGANIZATION';
}

export class SetManagedDepartmentsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  departmentIds!: string[];
}
