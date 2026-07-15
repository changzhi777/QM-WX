/**
 * ocr routes 路由层测试 — V0.2.1
 *
 * 覆盖 3 action 分发 + 鉴权 + imageBase64 校验 + 未知 action + base64→Buffer 透传
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  generalBasic: vi.fn(),
  generalAccurate: vi.fn(),
  idCard: vi.fn(),
}));

vi.mock('src/modules/ocr/ocr.service.js', () => ({ ocrService: mocks }));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
  },
}));

import { ocrRoutes } from '../../../src/modules/ocr/ocr.routes.js';

async function buildApp(authed = true) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: { id: string } }).user = { id: 'u1' };
    });
  }
  await app.register(ocrRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

async function post(app: Awaited<ReturnType<typeof buildApp>>, action: string, payload?: unknown) {
  return app.inject({ method: 'POST', url: '/', payload: { action, payload } });
}

describe('ocr routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp(false);
    const r = await post(app, 'generalBasic', { imageBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('imageBase64 缺失 → 400', async () => {
    const app = await buildApp();
    const r = await post(app, 'generalBasic', {});
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp();
    const r = await post(app, 'unknown', { imageBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('generalBasic → lines（base64 转 Buffer 透传）', async () => {
    mocks.generalBasic.mockResolvedValue(['10.5 km']);
    const app = await buildApp();
    const r = await post(app, 'generalBasic', { imageBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.lines).toEqual(['10.5 km']);
    expect(mocks.generalBasic).toHaveBeenCalledWith(expect.any(Buffer));
    await app.close();
  });

  it('generalAccurate → lines', async () => {
    mocks.generalAccurate.mockResolvedValue(['高精度']);
    const app = await buildApp();
    const r = await post(app, 'generalAccurate', { imageBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.lines).toEqual(['高精度']);
    await app.close();
  });

  it('idCard → card', async () => {
    mocks.idCard.mockResolvedValue({ name: '张三', idNo: '110', sex: '男', birth: '1990', address: '北京' });
    const app = await buildApp();
    const r = await post(app, 'idCard', { imageBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.card.name).toBe('张三');
    await app.close();
  });
});
