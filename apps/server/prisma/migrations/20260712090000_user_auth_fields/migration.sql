-- V0.1.129 User 认证扩展（phone unique + email/passwordHash/username）
-- phone: 已有列加 unique（生产验证 0 重复 0 非空，安全）
-- email/passwordHash/username: 新增列
-- nullable @unique 用 partial index（NULL 不参与唯一性）

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone") WHERE "phone" IS NOT NULL;

ALTER TABLE "User" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email") WHERE "email" IS NOT NULL;

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username") WHERE "username" IS NOT NULL;
