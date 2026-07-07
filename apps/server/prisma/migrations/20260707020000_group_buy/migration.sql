-- V0.1.37 2764 团购（简化 MVP — 参与记录意向）
-- GroupBuy（团购活动）+ GroupBuyMember（参与记录，unique 防重）

CREATE TABLE "GroupBuy" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "groupPrice" DECIMAL(10,2) NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBuy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupBuy_status_idx" ON "GroupBuy"("status");

CREATE TABLE "GroupBuyMember" (
    "id" TEXT NOT NULL,
    "groupBuyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBuyMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupBuyMember_groupBuyId_userId_key" UNIQUE ("groupBuyId", "userId")
);

CREATE INDEX "GroupBuyMember_userId_idx" ON "GroupBuyMember"("userId");

ALTER TABLE "GroupBuy" ADD CONSTRAINT "GroupBuy_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GroupBuyMember" ADD CONSTRAINT "GroupBuyMember_groupBuyId_fkey"
    FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBuyMember" ADD CONSTRAINT "GroupBuyMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
