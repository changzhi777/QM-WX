/**
 * distribution routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 8 action + 鉴权 + 未知 action 400
 * 注意：withdrawRequest → service.requestWithdrawal（方法名不同）
 * distribution 用共享 parseOrBadRequest helper（common/helpers/parse.js），
 * mock schema 后 helper 内 schema.parse 返原样 payload，不触发 badRequest 分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockDistributionService = vi.hoisted(() => ({
  mySummary: vi.fn(),
  myOrders: vi.fn(),
  myTeam: vi.fn(),
  myCommissionLogs: vi.fn(),
  myLevel: vi.fn(),
  inviteInfo: vi.fn(),
  requestWithdrawal: vi.fn(),
  myWithdrawals: vi.fn(),
}));

vi.mock('src/modules/distribution/distribution.service.js', () => ({
  distributionService: mockDistributionService,
}));
vi.mock('src/modules/distribution/distribution.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    PageInputSchema: passthrough,
    TeamInputSchema: passthrough,
    WithdrawalRequestInputSchema: passthrough,
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

import { distributionRoutes } from '../../../src/modules/distribution/distribution.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(distributionRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('distribution routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'mySummary' } });
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

  it('mySummary → 返汇总', async () => {
    mockDistributionService.mySummary.mockResolvedValue({ inviteCode: 'ABC123', level: 'V0' });
    const app = await buildApp({ authed: true });
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'mySummary' } });
    expect(r.json().data).toEqual({ inviteCode: 'ABC123', level: 'V0' });
    expect(mockDistributionService.mySummary).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('myOrders → 透传分页 input', async () => {
    mockDistributionService.myOrders.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myOrders', payload: { page: 1, pageSize: 10 } },
    });
    expect(mockDistributionService.myOrders).toHaveBeenCalledWith('u1', { page: 1, pageSize: 10 });
    await app.close();
  });

  it('myTeam → 透传 team input', async () => {
    mockDistributionService.myTeam.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myTeam', payload: { level: 1 } },
    });
    expect(mockDistributionService.myTeam).toHaveBeenCalledWith('u1', { level: 1 });
    await app.close();
  });

  it('myCommissionLogs → 透传分页 input', async () => {
    mockDistributionService.myCommissionLogs.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myCommissionLogs', payload: { page: 1 } },
    });
    expect(mockDistributionService.myCommissionLogs).toHaveBeenCalledWith('u1', { page: 1 });
    await app.close();
  });

  it('myLevel → 返等级', async () => {
    mockDistributionService.myLevel.mockResolvedValue({ current: 'V0' });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myLevel' } });
    expect(mockDistributionService.myLevel).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('inviteInfo → 返邀请信息', async () => {
    mockDistributionService.inviteInfo.mockResolvedValue({ inviteCode: 'ABC123' });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'inviteInfo' } });
    expect(mockDistributionService.inviteInfo).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('withdrawRequest → service.requestWithdrawal', async () => {
    mockDistributionService.requestWithdrawal.mockResolvedValue({ id: 'w1', amount: 50 });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'withdrawRequest', payload: { amount: 50 } },
    });
    expect(mockDistributionService.requestWithdrawal).toHaveBeenCalledWith('u1', { amount: 50 });
    await app.close();
  });

  it('myWithdrawals → 透传分页 input', async () => {
    mockDistributionService.myWithdrawals.mockResolvedValue({ list: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'myWithdrawals', payload: { page: 1 } },
    });
    expect(mockDistributionService.myWithdrawals).toHaveBeenCalledWith('u1', { page: 1 });
    await app.close();
  });
});
