import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQuery } from '../common.dto';

export class InventoryQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() type?: string;
}
