import { IsIn, IsObject } from 'class-validator';

export class CreateImportDto {
  @IsIn(['Customer', 'Contact', 'Lead', 'Project']) entityType!: string;
}

export class ImportMappingDto {
  @IsObject() mapping!: Record<string, string>;
}
