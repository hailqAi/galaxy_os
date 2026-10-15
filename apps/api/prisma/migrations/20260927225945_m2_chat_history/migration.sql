-- CreateTable
CREATE TABLE "ChatHistoryGrant" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "sourceGrantId" UUID NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "actions" TEXT[],
    "grantedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHistoryGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatHistoryGrant_grantId_idx" ON "ChatHistoryGrant"("grantId");

-- AddForeignKey
ALTER TABLE "ChatHistoryGrant" ADD CONSTRAINT "ChatHistoryGrant_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "ChatRoomGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatHistoryGrant" ADD CONSTRAINT "ChatHistoryGrant_sourceGrantId_fkey" FOREIGN KEY ("sourceGrantId") REFERENCES "ChatRoomGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatHistoryGrant" ADD CONSTRAINT "ChatHistoryGrant_interval_check" CHECK ("from" <= "to");
