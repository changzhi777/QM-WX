-- 收藏表（V0.1.29，社交向 — Content/Product 收藏）
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- unique 防重复收藏（同用户 + 同类型 + 同目标）
CREATE UNIQUE INDEX "Favorite_userId_targetType_targetId_key"
    ON "Favorite"("userId", "targetType", "targetId");

-- 索引：按用户 + 类型查（我的收藏列表，按 content/product 过滤）
CREATE INDEX "Favorite_userId_targetType_idx"
    ON "Favorite"("userId", "targetType");
