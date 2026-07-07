-- V0.1.37 续：团购深化（Order +groupBuyId 关联团购订单）
ALTER TABLE "Order" ADD COLUMN "groupBuyId" TEXT;

CREATE INDEX "Order_groupBuyId_idx" ON "Order"("groupBuyId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_groupBuyId_fkey"
    FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
