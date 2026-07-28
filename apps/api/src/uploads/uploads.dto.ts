import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class InitiateUploadDto {
  @IsString() @Length(1, 255) originalFilename!: string;
  @IsNumber() @Min(1) declaredSize!: number;
  @IsString() @Length(1, 200) mimeType!: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) checksum?: string;
}
export class UploadPartQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000) partNumber!: number;
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
}
export class CompleteUploadDto {
  @Matches(/^[a-f0-9]{64}$/) checksum!: string;
}
