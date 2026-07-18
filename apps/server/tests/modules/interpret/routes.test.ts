/**
 * interpret routes 路由层测试 — V0.2.33
 * 覆盖 鉴权 + minimax 配置校验 + fileBase64/inputKey 校验 + garmin 分发 + unknown action
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mocks = vi.hoisted(() => ({
  interpretGarminFit: vi.fn(),
  isMinimaxConfigured: vi.fn(() => true),
}));

vi.mock('src/modules/interpret/service.js', () => ({ interpretGarminFit: mocks.interpretGarminFit }));
vi.mock('src/modules/interpret/client.js', () => ({ isMinimaxConfigured: mocks.isMinimaxConfigured }));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400 }),
    featureDisabled: (f: string) => Object.assign(new Error(`${f} disabled`), { statusCode: 503 }),
  },
}));

import { interpretRoutes } from '../../../src/modules/interpret/routes.js';

async function buildApp(authed = true) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: { id: string } }).user = { id: 'u1' };
    });
  }
  await app.register(interpretRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isMinimaxConfigured.mockReturnValue(true);
});

async function post(app: Awaited<ReturnType<typeof buildApp>>, action: string, payload?: unknown) {
  return app.inject({ method: 'POST', url: '/', payload: { action, payload } });
}

describe('interpret routes (V0.2.33)', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp(false);
    const r = await post(app, 'garmin', { fileBase64: 'aGVsbG8=', inputKey: 'k' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('minimax 未配 → 503 featureDisabled', async () => {
    mocks.isMinimaxConfigured.mockReturnValue(false);
    const app = await buildApp();
    const r = await post(app, 'garmin', { fileBase64: 'aGVsbG8=', inputKey: 'k' });
    expect(r.statusCode).toBe(503);
    await app.close();
  });

  it('fileBase64 缺失 → 400', async () => {
    const app = await buildApp();
    const r = await post(app, 'garmin', { inputKey: 'k' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('inputKey 缺失 → 400', async () => {
    const app = await buildApp();
    const r = await post(app, 'garmin', { fileBase64: 'aGVsbG8=' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp();
    const r = await post(app, 'unknown', { fileBase64: 'aGVsbG8=', inputKey: 'k' });
    expect(r.statusCode).toBe(400);
    await app.close();
  });

  it('garmin happy → 200 + interpretGarminFit 透传 buffer/inputKey/userId', async () => {
    mocks.interpretGarminFit.mockResolvedValue({ interpretation: '佳明解读', recordId: 'rec1' });
    const app = await buildApp();
    const r = await post(app, 'garmin', { fileBase64: 'aGVsbG8=', inputKey: 'cos/k.fit' });
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toEqual({ interpretation: '佳明解读', recordId: 'rec1' });
    expect(mocks.interpretGarminFit).toHaveBeenCalledWith('u1', {
      buffer: expect.any(Buffer),
      inputKey: 'cos/k.fit',
    });
    await app.close();
  });

  it('P2: bodyLimit 10MB（5MB base64 body 通过，默认 1MB 会 413）', async () => {
    mocks.interpretGarminFit.mockResolvedValue({ interpretation: '大文件解读', recordId: 'rec-big' });
    const big = 'A'.repeat(5 * 1024 * 1024); // 5MB base64（超默认 1MB bodyLimit）
    const app = await buildApp();
    const r = await post(app, 'garmin', { fileBase64: big, inputKey: 'k' });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
});
