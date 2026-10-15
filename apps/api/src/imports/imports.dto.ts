import { IsIn, IsObject, ValidateBy } from 'class-validator';

export const MAX_IMPORT_MAPPING_ENTRIES = 100;

export class CreateImportDto {
  @IsIn(['Customer', 'Contact', 'Lead', 'Project']) entityType!: string;
}

export class ImportMappingDto {
  @IsObject()
  @ValidateBy({
    name: 'isBoundedImportMapping',
    validator: {
      validate: (value) =>
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.entries(value).length <= MAX_IMPORT_MAPPING_ENTRIES &&
        Object.entries(value).every(
          ([source, target]) =>
            source.length > 0 &&
            source.length <= 100 &&
            typeof target === 'string' &&
            target.length <= 100,
        ),
    },
  })
  mapping!: Record<string, string>;
}
