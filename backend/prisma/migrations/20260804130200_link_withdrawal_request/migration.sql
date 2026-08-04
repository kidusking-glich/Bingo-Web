-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "withdrawalRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_withdrawalRequestId_key" ON "Transaction"("withdrawalRequestId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "WithdrawalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

