CREATE TABLE "FileStorageReservation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileStorageReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileStorageReservation_storageKey_key"
ON "FileStorageReservation"("storageKey");

CREATE INDEX "FileStorageReservation_organizationId_idx"
ON "FileStorageReservation"("organizationId");

CREATE INDEX "FileStorageReservation_expiresAt_idx"
ON "FileStorageReservation"("expiresAt");
