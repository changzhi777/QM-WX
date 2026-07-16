-- V0.2.8 独立 Admin 账号体系（替白名单 openid）+ RBAC 3 角色 + 登录日志
-- 预置 root(super-admin)/admin(admin) 由 seed.ts 注入（env 密码 bcrypt）

CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "nickname" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
CREATE INDEX "Admin_role_idx" ON "Admin"("role");

CREATE TABLE "AdminLoginLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ip" TEXT,
    "ua" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLoginLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminLoginLog_adminId_createdAt_idx" ON "AdminLoginLog"("adminId", "createdAt");

ALTER TABLE "AdminLoginLog" ADD CONSTRAINT "AdminLoginLog_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
