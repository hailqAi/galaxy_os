ALTER TABLE "FileAsset"
  ALTER COLUMN "sizeBytes" TYPE BIGINT USING "sizeBytes"::bigint;
