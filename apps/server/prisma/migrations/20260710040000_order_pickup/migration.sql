-- V0.1.107 GAP-6 自提核销（pickupCode = 订单号末 6 位 + 3 位大写字母数字）
-- 自提订单下单时生成 pickupCode，用户到店出示，admin 后台手动输入核销

ALTER TABLE "Order" ADD COLUMN "pickupCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "pickupExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "pickupConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "pickupConfirmedBy" TEXT;

CREATE UNIQUE INDEX "Order_pickupCode_key" ON "Order"("pickupCode");
