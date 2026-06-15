-- AlterTable: 退款商户单号落库（幂等 + 对账匹配）
ALTER TABLE "WalletTransaction" ADD COLUMN "outRefundNo" TEXT;

-- CreateIndex: 唯一约束，防止同一笔退款重复落库
CREATE UNIQUE INDEX "WalletTransaction_outRefundNo_key" ON "WalletTransaction"("outRefundNo");
