/**
 * goal routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 6 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockGoalService = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  myProgress: vi.fn(),
  addFamilyGoal: vi.fn(),
  myFamilyGoals: vi.fn(),
}));

vi.mock('src/modules/goal/goal.service.js', () => ({ goalService: mockGoalService }));
vi.mock('src/modules/goal/goal.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    AddGoalInputSchema: passthrough,
    AddFamilyGoalSchema: passthrough,
    GoalIdInputSchema: passthrough,
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

import { goalRoutes } from '../../../src/modules/goal/goal.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(goalRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('goal routes', () => {
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

  it('list → 返目标列表', async () => {
    mockGoalService.list.mockResolvedValue({ goals: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'list' } });
    expect(r.json().data).toEqual({ goals: [] });
    expect(mockGoalService.list).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('add → 透传 input', async () => {
    mockGoalService.add.mockResolvedValue({ id: 'g1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'add', payload: { type: 'monthly', targetDistance: 50 } },
    });
    expect(mockGoalService.add).toHaveBeenCalledWith('u1', { type: 'monthly', targetDistance: 50 });
    await app.close();
  });

  it('remove → 取 id 传 service', async () => {
    mockGoalService.remove.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'remove', payload: { id: 'g1' } },
    });
    expect(mockGoalService.remove).toHaveBeenCalledWith('u1', 'g1');
    await app.close();
  });

  it('myProgress → 返进度', async () => {
    mockGoalService.myProgress.mockResolvedValue({ goals: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myProgress' } });
    expect(mockGoalService.myProgress).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('addFamilyGoal → 透传 input', async () => {
    mockGoalService.addFamilyGoal.mockResolvedValue({ id: 'fg1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'addFamilyGoal', payload: { familyId: 'f1', type: 'yearly' } },
    });
    expect(mockGoalService.addFamilyGoal).toHaveBeenCalledWith('u1', { familyId: 'f1', type: 'yearly' });
    await app.close();
  });

  it('myFamilyGoals → 返家庭目标', async () => {
    mockGoalService.myFamilyGoals.mockResolvedValue({ goals: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myFamilyGoals' } });
    expect(mockGoalService.myFamilyGoals).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
