/**
 * training routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 5 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockTrainingService = vi.hoisted(() => ({
  myPlans: vi.fn(),
  mySportRecords: vi.fn(),
  joinPlan: vi.fn(),
  myActivePlan: vi.fn(),
  leavePlan: vi.fn(),
}));

vi.mock('src/modules/training/training.service.js', () => ({ trainingService: mockTrainingService }));
vi.mock('src/modules/training/training.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    MyPlansQuerySchema: passthrough,
    MySportRecordsQuerySchema: passthrough,
    JoinPlanSchema: passthrough,
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

import { trainingRoutes } from '../../../src/modules/training/training.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(trainingRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('training routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myPlans' } });
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

  it('myPlans → 无参调用', async () => {
    mockTrainingService.myPlans.mockResolvedValue({ plans: [] });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myPlans' } });
    expect(r.json().data).toEqual({ plans: [] });
    expect(mockTrainingService.myPlans).toHaveBeenCalledWith();
    await app.close();
  });

  it('mySportRecords → 透传 input', async () => {
    mockTrainingService.mySportRecords.mockResolvedValue({ records: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'mySportRecords', payload: { limit: 20 } },
    });
    expect(mockTrainingService.mySportRecords).toHaveBeenCalledWith('u1', { limit: 20 });
    await app.close();
  });

  it('joinPlan → 透传 input', async () => {
    mockTrainingService.joinPlan.mockResolvedValue({ id: 'e1' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'joinPlan', payload: { planId: 'p1' } },
    });
    expect(mockTrainingService.joinPlan).toHaveBeenCalledWith('u1', { planId: 'p1' });
    await app.close();
  });

  it('myActivePlan → 返活跃计划', async () => {
    mockTrainingService.myActivePlan.mockResolvedValue({ plan: null });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myActivePlan' } });
    expect(mockTrainingService.myActivePlan).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('leavePlan → 返 ok', async () => {
    mockTrainingService.leavePlan.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'leavePlan' } });
    expect(mockTrainingService.leavePlan).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
