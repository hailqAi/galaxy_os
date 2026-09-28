-- AlterTable
ALTER TABLE "ChatDocumentRelease" ADD COLUMN     "customerPaymentId" UUID;

-- AddForeignKey
ALTER TABLE "ChatDocumentRelease" ADD CONSTRAINT "ChatDocumentRelease_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
