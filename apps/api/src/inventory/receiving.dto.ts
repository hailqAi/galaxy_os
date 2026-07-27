import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PageQuery } from '../common.dto';

export class GoodsReceiptsQuery extends PageQuery {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() status?: string;
}

export class GoodsReceiptLineDto {
  @IsUUID() purchaseOrderLineId!: string;
  @IsOptional() @IsUUID() shipmentItemId?: string;
  @IsUUID() storageLocationId!: string;
  @IsNumberString() receivedQuantity!: string;
  @IsOptional() @IsNumberString() damagedQuantity?: string;
  @IsOptional() @IsString() lotNumber?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serialNumbers?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateGoodsReceiptDto {
  @IsString() receiptNumber!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() shipmentId?: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

export class QualityInspectionLineDto {
  @IsUUID() goodsReceiptLineId!: string;
  @IsNumberString() inspectedQuantity!: string;
  @IsNumberString() passedQuantity!: string;
  @IsNumberString() failedQuantity!: string;
  @IsNumberString() quarantinedQuantity!: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
}

export class CreateQualityInspectionDto {
  @IsString() inspectionNumber!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QualityInspectionLineDto)
  lines!: QualityInspectionLineDto[];
}
