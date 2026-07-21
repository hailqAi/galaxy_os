import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateDepartmentDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @Length(1, 40) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional()
  @IsIn(['BOARD', 'DIVISION', 'DEPARTMENT', 'TEAM', 'OTHER'])
  unitType?: 'BOARD' | 'DIVISION' | 'DEPARTMENT' | 'TEAM' | 'OTHER';
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsUUID() managerMembershipId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional()
  @IsIn(['BOARD', 'DIVISION', 'DEPARTMENT', 'TEAM', 'OTHER'])
  unitType?: 'BOARD' | 'DIVISION' | 'DEPARTMENT' | 'TEAM' | 'OTHER';
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsUUID() managerMembershipId?: string;
}
