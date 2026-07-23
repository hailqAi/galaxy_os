import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateCustomerDto {
  @IsIn(['INDIVIDUAL', 'COMPANY']) type!: 'INDIVIDUAL' | 'COMPANY';
  @IsString() @Length(1, 200) displayName!: string;
  @IsOptional() @IsString() @Length(1, 200) legalName?: string;
  @IsOptional() @IsString() @Length(1, 50) taxCode?: string;
  @IsOptional() @IsString() @Length(1, 200) representativeName?: string;
  @IsOptional() @IsString() @Length(5, 30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsOptional() @IsString() @Length(1, 500) billingAddress?: string;
  @IsOptional() @IsString() @Length(1, 500) projectAddress?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'ARCHIVED']) status?:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'ARCHIVED';
  @IsOptional() @IsString() @Length(1, 5000) notes?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CreateContactDto {
  @IsString() @Length(1, 100) firstName!: string;
  @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @IsOptional() @IsString() @Length(1, 200) displayName?: string;
  @IsOptional() @IsString() @Length(1, 150) jobTitle?: string;
  @IsOptional() @IsString() @Length(1, 150) departmentName?: string;
  @IsOptional() @IsString() @Length(5, 30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() @Length(1, 5000) notes?: string;
}

export class UpdateContactDto extends PartialType(CreateContactDto) {}
