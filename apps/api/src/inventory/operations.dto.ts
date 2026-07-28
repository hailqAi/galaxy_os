import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class InventoryOperationLineDto {
  @IsUUID() inventoryItemId!: string;
  @IsOptional() @IsUUID() storageLocationId?: string;
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsUUID() serialId?: string;
  @IsNumberString() quantity!: string;
}

export class CreateReservationDto {
  @IsString() reservationNumber!: string;
  @IsUUID() projectId!: string;
  @IsUUID() warehouseId!: string;
  @Type(() => Date) @IsDate() requiredDate!: Date;
  @IsString() purpose!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryOperationLineDto)
  lines!: InventoryOperationLineDto[];
}

export class DecisionDto {
  @IsOptional() @IsString() comment?: string;
}

export class TransferLineDto extends InventoryOperationLineDto {
  @IsOptional() @IsUUID() destinationLocationId?: string;
}
export class CreateTransferDto {
  @IsString() transferNumber!: string;
  @IsIn([
    'WAREHOUSE_TO_WAREHOUSE',
    'LOCATION_TO_LOCATION',
    'WAREHOUSE_TO_SITE',
    'SITE_TO_WAREHOUSE',
  ])
  type!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsUUID() sourceWarehouseId!: string;
  @IsUUID() destinationWarehouseId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}
export class ReceiveTransferLineDto {
  @IsUUID() stockTransferLineId!: string;
  @IsNumberString() quantity!: string;
}
export class ReceiveTransferDto {
  @IsString() idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  lines!: ReceiveTransferLineDto[];
}

export class IssueLineDto extends InventoryOperationLineDto {
  @IsOptional() @IsUUID() reservationLineId?: string;
}
export class CreateIssueDto {
  @IsString() issueNumber!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsUUID() warehouseId!: string;
  @IsIn([
    'INSTALLATION',
    'PROJECT_SITE',
    'SHOWROOM',
    'SAMPLE',
    'INTERNAL_USE',
    'WARRANTY_REPLACEMENT',
    'RETURN_TO_SUPPLIER',
    'OTHER',
  ])
  reason!: string;
  @IsString() recipient!: string;
  @IsOptional() @IsUUID() evidenceFileId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueLineDto)
  lines!: IssueLineDto[];
}

export class ReturnLineDto extends InventoryOperationLineDto {
  @IsOptional() @IsUUID() stockIssueLineId?: string;
}
export class CreateReturnDto {
  @IsString() returnNumber!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsUUID() warehouseId!: string;
  @IsIn([
    'SITE_RETURN',
    'CUSTOMER_RETURN',
    'WARRANTY_RETURN',
    'SUPPLIER_RETURN',
    'UNUSED_MATERIAL',
    'OTHER',
  ])
  reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}

export class AdjustmentLineDto {
  @IsUUID() inventoryItemId!: string;
  @IsOptional() @IsUUID() storageLocationId?: string;
  @IsOptional() @IsUUID() lotId?: string;
  @IsOptional() @IsUUID() serialId?: string;
  @IsNumberString() expectedQuantity!: string;
  @IsNumberString() actualQuantity!: string;
}
export class CreateAdjustmentDto {
  @IsString() adjustmentNumber!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsUUID() warehouseId!: string;
  @IsIn([
    'COUNT_VARIANCE',
    'DAMAGE',
    'LOSS',
    'FOUND',
    'DATA_CORRECTION',
    'OTHER',
  ])
  reason!: string;
  @IsString() explanation!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines!: AdjustmentLineDto[];
}

export class CreateCycleCountDto {
  @IsString() countNumber!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsUUID() warehouseId!: string;
  @IsObject() scope!: Record<string, string>;
}
export class RecordCountLineDto {
  @IsUUID() cycleCountLineId!: string;
  @IsNumberString() countedQuantity!: string;
}
export class RecordCountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecordCountLineDto)
  lines!: RecordCountLineDto[];
}
