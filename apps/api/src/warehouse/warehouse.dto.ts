import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class WarehouseDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn([
    'MAIN',
    'PROJECT',
    'SHOWROOM',
    'SITE',
    'TRANSIT',
    'QUARANTINE',
    'RETURN',
    'OTHER',
  ])
  type!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() allowNegativeStock?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class WarehouseZoneDto {
  @IsString() code!: string;
  @IsString() name!: string;
}

export class StorageLocationDto {
  @IsOptional() @IsUUID() zoneId?: string;
  @IsOptional() @IsUUID() parentLocationId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn(['ZONE', 'AISLE', 'RACK', 'BIN', 'STAGING', 'QUARANTINE', 'OTHER'])
  locationType!: string;
  @IsOptional() @IsNumberString() capacity?: string;
}
