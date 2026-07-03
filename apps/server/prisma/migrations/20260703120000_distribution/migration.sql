-- V0.1.24 分销中心（方案 1 全持久化）
-- 3 新表：DistributionOrder / Team / CommissionLog
-- User +inviteCode(@unique) +distributorLevel(default V0)
-- Order +sourceUserId

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "distributorLevel" TEXT NOT NULL DEFAULT 'V0',
ADD COLUMN     "inviteCode" TEXT;

-- CreateTable
CREATE TABLE "DistributionOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(4,3) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" TEXT NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionOrder_orderId_key" ON "DistributionOrder"("orderId");

-- CreateIndex
CREATE INDEX "DistributionOrder_userId_status_idx" ON "DistributionOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "DistributionOrder_userId_createdAt_idx" ON "DistributionOrder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_inviteeId_key" ON "Team"("inviteeId");

-- CreateIndex
CREATE INDEX "Team_inviterId_idx" ON "Team"("inviterId");

-- CreateIndex
CREATE INDEX "CommissionLog_userId_createdAt_idx" ON "CommissionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_sourceUserId_idx" ON "Order"("sourceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- AddForeignKey
ALTER TABLE "DistributionOrder" ADD CONSTRAINT "DistributionOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DistributionOrder" ADD CONSTRAINT "DistributionOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Team" ADD CONSTRAINT "Team_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Team" ADD CONSTRAINT "Team_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommissionLog" ADD CONSTRAINT "CommissionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
