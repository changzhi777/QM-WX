-- V0.2.132 动作库用户自定义（Exercise +userId 字段 + 解除全局 name 唯一改组合）
-- 现有 15 个 seed 动作（userId=null）保持全局；新用户可加 userId=自己 的自定义动作
-- 同用户不能重名（@@unique[userId, name]）；不同用户/全局可同名

-- 1. 新增 userId 列（nullable，null=全局预设）
ALTER TABLE "Exercise" ADD COLUMN "userId" TEXT;

-- 2. 删除原全局 name @unique 约束
ALTER TABLE "Exercise" DROP CONSTRAINT IF EXISTS "Exercise_name_key";

-- 3. 加组合唯一约束（同用户不能重名）
CREATE UNIQUE INDEX "Exercise_userId_name_key" ON "Exercise"("userId", "name");

-- 4. 加 userId+category 索引（前端「我的动作库按分类」查询用）
CREATE INDEX "Exercise_userId_category_idx" ON "Exercise"("userId", "category");

-- 5. 加外键（user 删除时级联清理其自定义动作）
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
