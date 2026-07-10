/**
 * address routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 5 action + 鉴权 + 未知 action 400
 * 注意：address.routes 内联 parseOrBadRequest + AddressInputSchema.extend({id}) + z.object({id})，
 * 故 mock schema 需带 extend 方法兼容。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockAddressService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  setDefault: vi.fn(),
}));

vi.mock('src/modules/address/address.service.js', () => ({ addressService: mockAddressService }));
vi.mock('src/modules/address/address.schema.js', () => {
  // 带 extend 的 passthrough：AddressInputSchema.extend({id}) 在 remove 分支被调用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passthrough: any = { parse: (v: unknown) => v, extend: () => passthrough };
  return { AddressInputSchema: passthrough, AddressUpdateSchema: passthrough };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));

import { addressRoutes } from '../../../src/modules/address/address.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(addressRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('address routes', () => {
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

  it('list → 包成 { list }', async () => {
    mockAddressService.list.mockResolvedValue([]);
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
    expect(r.json().data).toEqual({ list: [] });
    expect(mockAddressService.list).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('create → 透传 input', async () => {
    mockAddressService.create.mockResolvedValue({ id: 'a1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'create', payload: { name: '张三', phone: '13800000000' } },
    });
    expect(mockAddressService.create).toHaveBeenCalledWith('u1', { name: '张三', phone: '13800000000' });
    await app.close();
  });

  it('update → 解构 id + rest input', async () => {
    mockAddressService.update.mockResolvedValue({ id: 'a1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'update', payload: { id: 'a1', name: '李四', phone: '13900000000' } },
    });
    expect(mockAddressService.update).toHaveBeenCalledWith('u1', 'a1', { name: '李四', phone: '13900000000' });
    await app.close();
  });

  it('remove → 取 id 传 service', async () => {
    mockAddressService.remove.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'remove', payload: { id: 'a1' } },
    });
    expect(mockAddressService.remove).toHaveBeenCalledWith('u1', 'a1');
    await app.close();
  });

  it('setDefault → 取 id 传 service', async () => {
    mockAddressService.setDefault.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'setDefault', payload: { id: 'a1' } },
    });
    expect(mockAddressService.setDefault).toHaveBeenCalledWith('u1', 'a1');
    await app.close();
  });
});
