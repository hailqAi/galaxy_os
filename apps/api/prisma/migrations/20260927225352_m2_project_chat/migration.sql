/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,id]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "ChatProjectGrant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "actions" TEXT[],
    "roomCeiling" TEXT[],
    "grantedBy" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatProjectGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomGrant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issuedUnderId" UUID NOT NULL,
    "actions" TEXT[],
    "grantedBy" UUID NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChatRoomGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "clientKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatProjectGrant_organizationId_userId_projectId_idx" ON "ChatProjectGrant"("organizationId", "userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatProjectGrant_id_organizationId_projectId_key" ON "ChatProjectGrant"("id", "organizationId", "projectId");

-- CreateIndex
CREATE INDEX "ChatRoom_organizationId_projectId_group_idx" ON "ChatRoom"("organizationId", "projectId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_id_organizationId_projectId_key" ON "ChatRoom"("id", "organizationId", "projectId");

-- CreateIndex
CREATE INDEX "ChatRoomGrant_roomId_userId_effectiveAt_idx" ON "ChatRoomGrant"("roomId", "userId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_roomId_authorId_clientKey_key" ON "ChatMessage"("roomId", "authorId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_roomId_sequence_key" ON "ChatMessage"("roomId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "Project"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "ChatProjectGrant" ADD CONSTRAINT "ChatProjectGrant_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatProjectGrant" ADD CONSTRAINT "ChatProjectGrant_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomGrant" ADD CONSTRAINT "ChatRoomGrant_roomId_organizationId_projectId_fkey" FOREIGN KEY ("roomId", "organizationId", "projectId") REFERENCES "ChatRoom"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomGrant" ADD CONSTRAINT "ChatRoomGrant_issuedUnderId_organizationId_projectId_fkey" FOREIGN KEY ("issuedUnderId", "organizationId", "projectId") REFERENCES "ChatProjectGrant"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomGrant" ADD CONSTRAINT "ChatRoomGrant_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationMembership"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_organizationId_projectId_fkey" FOREIGN KEY ("roomId", "organizationId", "projectId") REFERENCES "ChatRoom"("id", "organizationId", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;
