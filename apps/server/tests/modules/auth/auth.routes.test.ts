/**
 * auth routes 单元测试
 *
 * POST /api/auth/refresh 流程：
 * 1. 验 body 格式（refreshToken 必填）
 * 2. 验 refresh JWT（kind='refresh'）
 * 3. 用户仍存在
 * 4. 签新 access + refresh
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockFindById = vi.fn();
vi.mock('src/modules/user/user.repository.js', () => ({
  userRepo: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

// refresh 一次性轮换依赖 Redis（exists 检测复用 + setex 拉黑）
const mockRedis = vi.hoisted(() => ({ exists: vi.fn(), setex: vi.fn() }));
vi.mock('src/infra/redis.js', () => ({ redis: mockRedis }));

import { authRoutes } from '../../../src/modules/auth/auth.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp() {
  const app = Fastify();
  // 模拟 @fastify/jwt 的 sign/verify
  (app as unknown as { jwt: { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> } }).jwt = {
    sign: vi.fn(async (payload: object) => `signed.${JSON.stringify(payload)}`),
    verify: vi.fn((token: string) => {
      if (token === 'invalid') throw new Error('jwt malformed');
      if (token === 'access-token') return { sub: 'u1', openid: 'o1' }; // kind 缺失
      if (token === 'good-refresh')
        return {
          sub: 'u1',
          openid: 'o1',
          kind: 'refresh',
          jti: 'jti-1',
          exp: Math.floor(Date.now() / 1000) + 1000,
        };
      throw new Error('unknown');
    }),
  };
  // 模拟 app.ts 的 setErrorHandler：BusinessError → {code, msg}
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: '服务器内部错误' });
  });
  await app.register(authRoutes, { prefix: '/api/auth' });
  return app;
}

describe('POST /api/auth/refresh', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.exists.mockResolvedValue(0); // 默认：token 未被使用过
    mockRedis.setex.mockResolvedValue('OK');
    app = await buildApp();
    await app.ready();
  });

  it('缺 body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('refreshToken 空字符串 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refreshToken 非法 → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'invalid' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().msg).toMatch(/invalid or expired/);
  });

  it('access token（非 refresh）→ 401 kind 错', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'access-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().msg).toBe('not a refresh token');
  });

  it('用户已被删 → 401', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'good-refresh' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().msg).toBe('user not found');
  });

  it('正常：签新 access + refresh', async () => {
    mockFindById.mockResolvedValue({ id: 'u1', openid: 'o1' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'good-refresh' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe(0);
    expect(body.data.accessToken).toMatch(/^signed\./);
    expect(body.data.refreshToken).toMatch(/^signed\./);
    // 两次 sign：一次 access 一次 refresh
    const sign = (app as unknown as { jwt: { sign: ReturnType<typeof vi.fn> } }).jwt.sign;
    expect(sign).toHaveBeenCalledTimes(2);
    // refresh 应带 kind='refresh'
    const refreshCall = sign.mock.calls[1];
    expect(refreshCall[1]).toEqual({ expiresIn: '30d' });
    // 新 refresh 带新 jti
    expect((refreshCall[0] as { jti?: string }).jti).toBeDefined();
    // 旧 token 被拉黑
    expect(mockRedis.setex).toHaveBeenCalledWith('auth:refresh:used:jti-1', expect.any(Number), '1');
  });

  it('refresh token 复用（已拉黑）→ 401', async () => {
    mockFindById.mockResolvedValue({ id: 'u1', openid: 'o1' });
    mockRedis.exists.mockResolvedValue(1); // 已被使用过
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'good-refresh' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().msg).toMatch(/already used/);
  });
});
