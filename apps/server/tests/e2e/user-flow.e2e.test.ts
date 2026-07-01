/**
 * user 全链路 e2e — 重点回归 P0-1 修复
 *
 * P0-1（已修）：user.routes 在 public:true 路由下，me/updateProfile/bindApps 用
 *   `if (!req.user) throw Errors.unauthorized()` 守卫时，恒 401（authPlugin
 *   对 public 跳过 jwtVerify）。修复：改用 `requireLogin(req)`，本 e2e 即回归保护。
 *
 * 链路：
 *   ① 登录（mock code2Session → 拿 JWT）
 *   ② me 无 token → 401（验证 public 路由内确实要求鉴权）
 *   ③ me 带 token → 200 + user info（**P0-1 修复关键**）
 *   ④ updateProfile → 200 + nickname 更新
 *   ⑤ bindApps → 200
 *
 * 数据隔离：所有测试数据 prefix `e2e-user-` + afterAll 强删
 *
 * 跑法：RUN_E2E=1 pnpm test user-flow
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';

const E2E_CODE = 'e2e-user-code';
const E2E_OPENID = `e2e-user-${E2E_CODE}`;
const E2E_NICKNAME_NEW = '体验用户改名';

// ===== mock 微信 code2Session =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => {
    return { openid: `e2e-user-${code}`, session_key: 'sk-user' };
  }),
}));

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;

describe.skipIf(skip)('user 全链路 e2e（P0-1 回归）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. 登录拿 JWT
    const login = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_CODE } },
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json() as { code: number; data?: { accessToken: string; user: { id: string } } };
    expect(loginBody.code).toBe(0);
    accessToken = loginBody.data!.accessToken;
    userId = loginBody.data!.user.id;
  });

  afterAll(async () => {
    // 清理：按 openid prefix 关联删除（替代硬编码 userId — 防 createdAt 漂移）
    const users = await prisma.user.findMany({ where: { openid: { startsWith: 'e2e-user-' } } });
    for (const u of users) {
      // 关联表（按 userId 反查）
      await prisma.checkin.deleteMany({ where: { userId: u.id } });
      await prisma.pointsRecord.deleteMany({ where: { userId: u.id } });
      await prisma.wallet.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  // ===== P0-1 回归核心 =====
  it('me 无 token → 401（public 路由内显式鉴权生效）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'me', payload: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('me 带 token → 200 + 返回当前 user（**P0-1 修复**）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { action: 'me', payload: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { code: number; data?: { user: { id: string; openid: string }; config: unknown } };
    expect(body.code).toBe(0);
    expect(body.data!.user.id).toBe(userId);
    expect(body.data!.user.openid).toBe(E2E_OPENID);
    expect(body.data!.config).toBeDefined();
  });

  it('updateProfile 带 token → 200 + nickname 更新', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { action: 'updateProfile', payload: { nickname: E2E_NICKNAME_NEW } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { code: number; data?: { user: { nickname: string | null } } };
    expect(body.code).toBe(0);
    expect(body.data!.user.nickname).toBe(E2E_NICKNAME_NEW);
  });

  it('bindApps 带 token → 501 Not Implemented（service stub；鉴权通过）', async () => {
    // 注：bindApps service 暂为 stub（throw notImplemented "Phase 1.1"），不返 200
    // 关键回归价值：能走到 service 层说明鉴权正确（修过 P0-1 后不再 401）
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        action: 'bindApps',
        payload: { boundApps: { garmin: true } },
      },
    });
    expect(res.statusCode).toBe(501);
  });

  // ===== 负面用例 =====
  it('updateProfile 无 token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'updateProfile', payload: { nickname: 'noauth' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('bindApps 无 token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'bindApps', payload: { apps: [] } },
    });
    expect(res.statusCode).toBe(401);
  });
});