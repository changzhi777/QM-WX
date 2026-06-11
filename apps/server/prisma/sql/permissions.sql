-- ============================================================
-- 数据库权限复查（04 §T5-3）
--
-- 原则：
-- 1. 前端永不直连 DB
-- 2. 只有 "appserver" 角色对业务表有 CRUD
-- 3. "migrator" 角色只用于 schema 变更
-- 4. PUBLIC 全部 REVOKE
--
-- 跑法：
--   1. psql -U postgres -d qmwx_dev
--   2. \i apps/server/prisma/sql/permissions.sql
--   3. 改 .env：DATABASE_URL 用 appserver 用户的连接串
-- ============================================================

-- ===== 1. 建角色 =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'appserver') THEN
    CREATE ROLE appserver LOGIN PASSWORD 'change-me-appserver';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator LOGIN PASSWORD 'change-me-migrator' SUPERUSER;
  END IF;
END
$$;

-- ===== 2. 业务表清单（来自 prisma/schema.prisma）=====
-- 单数表名（Prisma 默认）：User, Checkin, Group, GroupMember, Product, Order, OrderItem,
-- PointsRecord, Wallet, WalletTransaction, Content, Enrollment, AppConfig, GroupReport

-- ===== 3. 应用 schema 权限 =====
GRANT USAGE ON SCHEMA public TO appserver, migrator;

-- ===== 4. migrator：全权（DDL/DML 都能跑）=====
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO migrator;

-- ===== 5. appserver：业务表 CRUD + sequence（id 自增）=====
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO appserver;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appserver;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO appserver;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO appserver;

-- ===== 6. PUBLIC 撤销（保险起见）=====
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- ===== 7. 验证 =====
-- 应看到：
--   appserver  | arwd/postgres
--   migrator   | arwd/postgres
--   PUBLIC     | /postgres      （/= 无权限）
\dp

-- ===== 8. 误用检查（开发期可开）=====
-- 强制：所有连接必须用 appserver 角色，不允许 postgres 直连业务
-- 如要禁止 postgres 直连业务，执行：
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM postgres;
-- 谨慎操作，**migrate / seed 仍需 postgres / migrator**

-- ============================================================
-- 9. 重要：连接串配置
-- ============================================================
-- .env 改为：
--   DATABASE_URL="postgresql://appserver:change-me-appserver@localhost:5432/qmwx_dev"
-- migrate 命令临时用 migrator / postgres：
--   DATABASE_URL="postgresql://migrator:change-me-migrator@localhost:5432/qmwx_dev" \
--     pnpm prisma migrate dev
