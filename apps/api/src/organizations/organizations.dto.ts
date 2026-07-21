import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 100) timezone?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string;
}

export class CreateOrganizationDto extends UpdateOrganizationDto {
  @IsString() @Length(1, 120) declare name: string;
  @IsString() @Matches(/^[a-z0-9-]+$/) @Length(2, 80) slug!: string;
  @IsString() @Length(1, 100) declare timezone: string;
  @Matches(/^[A-Z]{3}$/) declare defaultCurrency: string;
}
