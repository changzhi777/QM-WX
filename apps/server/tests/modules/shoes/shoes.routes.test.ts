/**
 * shoes routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 5 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockShoesService = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  retire: vi.fn(),
  myStats: vi.fn(),
}));

vi.mock('src/modules/shoes/shoes.service.js', () => ({ shoesService: mockShoesService }));
vi.mock('src/modules/shoes/shoes.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    AddShoeInputSchema: passthrough,
    UpdateShoeInputSchema: passthrough,
    ShoeIdInputSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { shoesRoutes } from '../../../src/modules/shoes/shoes.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(shoesRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('shoes routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unknown' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().msg).toContain('unknown action');
    await app.close();
  });

  it('list → 返跑鞋列表', async () => {
    mockShoesService.list.mockResolvedValue({ shoes: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
    expect(r.json().data).toEqual({ shoes: [] });
    expect(mockShoesService.list).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('add → 透传 input', async () => {
    mockShoesService.add.mockResolvedValue({ id: 's1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'add', payload: { brand: 'Nike', model: 'Pegasus' } },
    });
    expect(mockShoesService.add).toHaveBeenCalledWith('u1', { brand: 'Nike', model: 'Pegasus' });
    await app.close();
  });

  it('update → 透传 input', async () => {
    mockShoesService.update.mockResolvedValue({ id: 's1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'update', payload: { id: 's1', nickname: '跑鞋1' } },
    });
    expect(mockShoesService.update).toHaveBeenCalledWith('u1', { id: 's1', nickname: '跑鞋1' });
    await app.close();
  });

  it('retire → 取 id 传 service', async () => {
    mockShoesService.retire.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'retire', payload: { id: 's1' } },
    });
    expect(mockShoesService.retire).toHaveBeenCalledWith('u1', 's1');
    await app.close();
  });

  it('myStats → 返统计', async () => {
    mockShoesService.myStats.mockResolvedValue({ total: 0, activeCount: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myStats' } });
    expect(mockShoesService.myStats).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
