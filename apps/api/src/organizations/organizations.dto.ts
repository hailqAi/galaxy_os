import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 100) timezone?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) defaultCurrency?: string;
}
