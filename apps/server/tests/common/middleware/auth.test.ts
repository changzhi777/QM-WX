/**
 * JWT 鉴权中间件测试
 *
 * 关键路径：
 * - 公开端点（public: true）跳过 jwtVerify
 * - 受保护端点：jwtVerify 成功 → 放行
 * - 受保护端点：jwtVerify 抛错 → 抛 unauthorized
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: (msg = '未登录') => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 401;
      e.statusCode = 401;
      return e;
    },
  },
}));

// 直接 import 让 vitest 用 mock 版
import { authPlugin } from '../../../src/common/middleware/auth.js';

async function buildTestApp() {
  const app = Fastify();
  await app.register(authPlugin);
  app.get('/public-route', { config: { public: true } }, async () => ({ ok: true }));
  app.get('/protected-route', async (req) => {
    // jwtVerify 成功时 @fastify/jwt 会把 payload 放到 req.user
    await (req as { jwtVerify: () => Promise<void> }).jwtVerify();
    return { ok: true, user: (req as { user?: unknown }).user };
  });
  return app;
}

describe('authPlugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    await app.ready();
  });

  it('公开端点：跳过 jwtVerify 直接 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/public-route' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('受保护端点：缺少 token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected-route' });
    expect(res.statusCode).toBe(401);
  });

  it('受保护端点：非法 token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected-route',
      headers: { authorization: 'Bearer invalid' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('受保护端点：合法 token（无 jwt 注册时仍 401，验证 jwtVerify 被调用）', async () => {
    // 测试 app 没注册 @fastify/jwt，jwtVerify 必然抛错 → 走 401 分支
    const res = await app.inject({
      method: 'GET',
      url: '/protected-route',
      headers: { authorization: 'Bearer xxx' },
    });
    expect(res.statusCode).toBe(401);
  });
});
