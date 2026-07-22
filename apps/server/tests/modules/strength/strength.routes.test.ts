/**
 * strength routes 路由层测试（V0.2.73 补测，GAP-3.5 补漏）
 *
 * 覆盖 7 action + 鉴权 401 + unknown 400
 * 关键差异：
 *   - service 用 `import * as` 命名空间导入（非具名 feedService）
 *   - routes 用 `throw Errors.*`（非 feed 的 reply.status），Fastify 默认序列化为 { statusCode, error, message }
 *   - listExercises 不传 userId（全局动作库）
 *   - sessionDetail 取 payload.sessionId 单独传
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockService = vi.hoisted(() => ({
  startSession: vi.fn(),
  addSet: vi.fn(),
  finishSession: vi.fn(),
  listSessions: vi.fn(),
  sessionDetail: vi.fn(),
  myVolume: vi.fn(),
  listExercises: vi.fn(),
}));

vi.mock('src/modules/strength/strength.service.js', () => mockService);
vi.mock('src/modules/strength/strength.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    AddSetSchema: passthrough,
    FinishSessionSchema: passthrough,
    SessionDetailSchema: passthrough,
    ListSessionsSchema: passthrough,
    MyVolumeSchema: passthrough,
    ListExercisesSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { statusCode: 404 }),
  },
}));

import { strengthRoutes } from '../../../src/modules/strength/strength.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(strengthRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('strength routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'startSession' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unknown' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain('unknown action');
    await app.close();
  });

  it('startSession → 无参调用（仅 userId）', async () => {
    mockService.startSession.mockResolvedValue({ id: 's1' });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'startSession' } });
    expect(r.json().data).toEqual({ id: 's1' });
    expect(mockService.startSession).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('addSet → 透传 AddSetSchema.parse 后 input', async () => {
    mockService.addSet.mockResolvedValue({ id: 'set1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'addSet', payload: { sessionId: 's1', exerciseId: 'e1', reps: 10, weight: 60, setIndex: 1 } },
    });
    expect(mockService.addSet).toHaveBeenCalledWith('u1', { sessionId: 's1', exerciseId: 'e1', reps: 10, weight: 60, setIndex: 1 });
    await app.close();
  });

  it('finishSession → 透传 FinishSessionSchema.parse 后 input', async () => {
    mockService.finishSession.mockResolvedValue({ id: 's1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'finishSession', payload: { sessionId: 's1', durationSec: 1800, note: '力竭' } },
    });
    expect(mockService.finishSession).toHaveBeenCalledWith('u1', { sessionId: 's1', durationSec: 1800, note: '力竭' });
    await app.close();
  });

  it('listSessions → payload 缺省走 {} 默认', async () => {
    mockService.listSessions.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'listSessions' } });
    expect(mockService.listSessions).toHaveBeenCalledWith('u1', {});
    await app.close();
  });

  it('sessionDetail → 取 payload.sessionId 单独传', async () => {
    mockService.sessionDetail.mockResolvedValue({ id: 's1', sets: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'sessionDetail', payload: { sessionId: 's1' } },
    });
    expect(mockService.sessionDetail).toHaveBeenCalledWith('u1', 's1');
    await app.close();
  });

  it('myVolume → payload 缺省走 {} 默认', async () => {
    mockService.myVolume.mockResolvedValue({ totalVolume: 0 });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myVolume' } });
    expect(mockService.myVolume).toHaveBeenCalledWith('u1', {});
    await app.close();
  });

  it('listExercises → 不传 userId（全局动作库）', async () => {
    mockService.listExercises.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'listExercises', payload: { category: 'chest' } },
    });
    expect(r.json().data).toEqual({ list: [] });
    // 关键：listExercises 只传 parse 后 input，不含 userId（全局动作库）
    expect(mockService.listExercises).toHaveBeenCalledWith({ category: 'chest' });
    await app.close();
  });
});
