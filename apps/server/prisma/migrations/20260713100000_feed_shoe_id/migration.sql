-- V0.1.136 Feed +shoeId 字段
-- 关联跑鞋：动态卡显示跑鞋信息（鞋评/品牌/累计里程）
ALTER TABLE "Feed" ADD COLUMN "shoeId" TEXT;

-- 索引（V0.1.136 排行榜/筛选优化）
CREATE INDEX "Feed_shoeId_idx" ON "Feed"("shoeId");

-- 外键：Shoe 删除 → Feed.shoeId SET NULL（避免孤儿，保留动态）
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_shoeId_fkey" FOREIGN KEY ("shoeId") REFERENCES "Shoe"("id") ON DELETE SET NULL ON UPDATE CASCADE;