-- Cart + SigninRecord 表（V0.1.22 B-核心）
-- See: .zcf/plan/current/b-ecommerce-core.md

-- 购物车（跨设备持久化，同商品合并 qty）
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cart_userId_productId_key" ON "Cart"("userId", "productId");
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 签到记录（连续签到，防同日重复）
CREATE TABLE "SigninRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "continuousDays" INTEGER NOT NULL DEFAULT 1,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SigninRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SigninRecord_userId_date_key" ON "SigninRecord"("userId", "date");
CREATE INDEX "SigninRecord_userId_idx" ON "SigninRecord"("userId");
ALTER TABLE "SigninRecord" ADD CONSTRAINT "SigninRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
