-- V0.1.118 赛事报名 wxpay 支付（Order 区分赛事类型 + Enrollment 关联 Order）
-- Order.contentType: null=商品订单，'enroll'=赛事报名
-- Enrollment.orderId: 赛事报名支付关联 Order（wxpay 回调 Order paid → enrollment confirmed）
ALTER TABLE "Order" ADD COLUMN "contentType" TEXT;
ALTER TABLE "Order" ADD COLUMN "contentId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "orderId" TEXT;
