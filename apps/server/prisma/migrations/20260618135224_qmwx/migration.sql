/*
  Warnings:

  - A unique constraint covering the columns `[wxTransactionId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "payChannel" TEXT,
ADD COLUMN     "prepayId" TEXT,
ADD COLUMN     "wxTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_wxTransactionId_key" ON "Order"("wxTransactionId");
