import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateDepartmentDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]+$/) @Length(1, 40) code!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
}
