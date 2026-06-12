/**
 * user routes 冒烟测试
 *
 * 4 个 action：
 * - login (public)
 * - updateProfile (需 auth)
 * - bindApps (需 auth)
 * - me (需 auth)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  login: vi.fn(),
  updateProfile: vi.fn(),
  bindApps: vi.fn(),
  getById: vi.fn(),
}));

const mockGetLoginConfig = vi.fn();
vi.mock('src/modules/user/user.service.js', () => ({
  userService: mockService,
}));
vi.mock('src/modules/app-config/app-config.repository.js', () => ({
  configRepo: { getLoginConfig: () => mockGetLoginConfig() },
}));

import { userRoutes } from '../../../src/modules/user/user.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  if (opts.authed) {
    app.decorateRequest('user', undefined);
    app.addHook('onRequest', async (req) => {
      (req as { user?: { id: string; openid: string } }).user = { id: 'u1', openid: 'o1' };
    });
  }
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(userRoutes, { prefix: '/api/user' });
  return app;
}

describe('POST /api/user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('action=login：public，调用 userService.login', async () => {
    mockService.login.mockResolvedValue({ accessToken: 't', refreshToken: 'r' });
    const app = await buildApp(); // 未 authed
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: 'wx-code' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.login).toHaveBeenCalled();
  });

  it('action=updateProfile 缺 user → 401', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'updateProfile', payload: { nickname: '新名' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('action=updateProfile 正常', async () => {
    mockService.updateProfile.mockResolvedValue({ id: 'u1', nickname: '新名' });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'updateProfile', payload: { nickname: '新名' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.updateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ nickname: '新名' }));
  });

  it('action=bindApps 缺 user → 401', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'bindApps', payload: { boundApps: { garmin: true } } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('action=bindApps 正常', async () => {
    mockService.bindApps.mockResolvedValue({ id: 'u1' });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'bindApps', payload: { boundApps: { garmin: true } } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.bindApps).toHaveBeenCalledWith('u1', expect.objectContaining({ boundApps: { garmin: true } }));
  });

  it('action=me 缺 user → 401', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'me' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('action=me 正常：返回 user + config', async () => {
    mockService.getById.mockResolvedValue({ id: 'u1', nickname: '张三' });
    mockGetLoginConfig.mockResolvedValue({ wechatLogin: true });
    const app = await buildApp({ authed: true });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'me' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.user).toEqual({ id: 'u1', nickname: '张三' });
    expect(res.json().data.config).toEqual({ wechatLogin: true });
    expect(mockGetLoginConfig).toHaveBeenCalled();
  });

  it('缺 action 字段 → 500（ActionBodySchema 拒绝，ZodError 未被 route 捕获）', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { payload: {} },
    });
    expect(res.statusCode).toBe(500);
  });

  it('action 字段值非法 → 500（ZodError）', async () => {
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'wat' },
    });
    expect(res.statusCode).toBe(500);
  });
});
