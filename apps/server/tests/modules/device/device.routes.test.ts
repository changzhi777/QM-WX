/**
 * device routes 路由层测试（V0.2.73 全 action 补全，GAP-3.5 补漏）
 *
 * 覆盖 24 action 主 switch + 鉴权 401 + unknown 400
 * 设计：
 *   - mock deviceService（具名导入 { deviceService }）+ schema passthrough（隔离 schema，只测分流）
 *   - setErrorHandler 把 throw Errors.* 转 statusCode（routes 用 throw 非 reply.status）
 *   - it.each 批量测无参/透传 action；unbind（取 vendor）/ syncFromTerra（不走 schema）单独测
 *   - 4 个特殊路由（uploadXiaomiZip / uploadCorosFit / garmin-webhook / terra-webhook）由各自子测试覆盖
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { mockErrors } from '../../helpers/mockErrors.js';

const mockDeviceService = vi.hoisted(() => ({
  listBindings: vi.fn().mockResolvedValue([]),
  startOAuth: vi.fn().mockResolvedValue({ authUrl: 'https://oauth.example' }),
  unbind: vi.fn().mockResolvedValue({ ok: true }),
  syncWeRun: vi.fn().mockResolvedValue({ ok: true, synced: 0 }),
  submitHeartRate: vi.fn().mockResolvedValue({ ok: true }),
  submitSpO2: vi.fn().mockResolvedValue({ ok: true }),
  submitBodyComposition: vi.fn().mockResolvedValue({ ok: true }),
  myHealthHistory: vi.fn().mockResolvedValue({ list: [] }),
  bindBleDevice: vi.fn().mockResolvedValue({ ok: true }),
  myBindings: vi.fn().mockResolvedValue({ list: [] }),
  myActivities: vi.fn().mockResolvedValue({ list: [] }),
  mySleep: vi.fn().mockResolvedValue({ list: [] }),
  myMetrics: vi.fn().mockResolvedValue({ list: [] }),
  myFitnessAge: vi.fn().mockResolvedValue({ age: 30 }),
  myTodayHealth: vi.fn().mockResolvedValue({}),
  myWeRun: vi.fn().mockResolvedValue({ list: [] }),
  myPending: vi.fn().mockResolvedValue({ list: [] }),
  myProcessed: vi.fn().mockResolvedValue({ list: [] }),
  ignoreActivity: vi.fn().mockResolvedValue({ ok: true }),
  importToCheckin: vi.fn().mockResolvedValue({ ok: true }),
  corosAuthUrl: vi.fn().mockResolvedValue({ url: 'https://x' }),
  garminAuthUrl: vi.fn().mockResolvedValue({ url: 'https://x' }),
  syncFromTerra: vi.fn().mockResolvedValue({ ok: true }),
  authList: vi.fn().mockResolvedValue({ list: [] }),
}));

vi.mock('src/modules/device/device.service.js', () => ({ deviceService: mockDeviceService }));
vi.mock('src/modules/device/device.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    ListBindingsInputSchema: passthrough,
    StartOAuthInputSchema: passthrough,
    SyncWeRunInputSchema: passthrough,
    MyWeRunQuerySchema: passthrough,
    UnbindInputSchema: passthrough,
    BindBleDeviceInputSchema: passthrough,
    SubmitHeartRateInputSchema: passthrough,
    SubmitSpO2InputSchema: passthrough,
    SubmitBodyCompositionSchema: passthrough,
    MyHealthHistoryQuerySchema: passthrough,
    MyActivitiesQuerySchema: passthrough,
    MySleepQuerySchema: passthrough,
    MyMetricsQuerySchema: passthrough,
    MyFitnessAgeQuerySchema: passthrough,
    ActivityPageQuerySchema: passthrough,
    IgnoreActivityInputSchema: passthrough,
    ImportToCheckinInputSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

import { deviceRoutes } from '../../../src/modules/device/device.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { code?: number; statusCode?: number };
    return reply.status(e.statusCode ?? 500).send({ code: e.code ?? 500, msg: err.message });
  });
  await app.register(deviceRoutes, { prefix: '/api/device' });
  return app;
}

async function authedApp() {
  const app = await buildApp({ authed: true });
  await app.ready();
  return app;
}

// 动态访问 mock（it.each 的 action 为 string）
const svc = mockDeviceService as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => vi.clearAllMocks());

describe('POST /api/device — 24 action 全分流', () => {
  it.each(['listBindings', 'startOAuth', 'unbind', 'syncWeRun', 'submitHeartRate'])(
    'action=%s 未登录 → 401',
    async (action) => {
      const app = await buildApp();
      await app.ready();
      const res = await app.inject({ method: 'POST', url: '/api/device', payload: { action, payload: {} } });
      expect(res.statusCode).toBe(401);
      await app.close();
    },
  );

  it('listBindings 已登录 → 返回空 list', async () => {
    const app = await authedApp();
    const res = await app.inject({ method: 'POST', url: '/api/device', payload: { action: 'listBindings', payload: {} } });
    expect(res.json().data).toEqual([]);
    expect(mockDeviceService.listBindings).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await authedApp();
    const res = await app.inject({ method: 'POST', url: '/api/device', payload: { action: 'wat' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // 无参 action（仅传 userId）
  it.each(['myBindings', 'myTodayHealth', 'corosAuthUrl', 'garminAuthUrl', 'authList'])(
    '%s → 无参（仅 userId）',
    async (action) => {
      const app = await authedApp();
      await app.inject({ method: 'POST', url: '/api/device', payload: { action, payload: {} } });
      expect(svc[action]).toHaveBeenCalledWith('u1');
      await app.close();
    },
  );

  // 透传 schema.parse 后 input（payload 整体作为第二参数）
  it.each<[string, Record<string, unknown>]>([
    ['startOAuth', { vendor: 'garmin' }],
    ['syncWeRun', { stepInfoList: [] }],
    ['submitHeartRate', { hr: 80, ts: '2026-07-01T00:00:00Z' }],
    ['submitSpO2', { spo2: 98 }],
    ['submitBodyComposition', { weight: 70 }],
    ['myHealthHistory', { days: 7 }],
    ['bindBleDevice', { mac: 'AA:BB:CC' }],
    ['myActivities', { page: 1, pageSize: 20 }],
    ['mySleep', { date: '2026-07-01' }],
    ['myMetrics', { days: 30 }],
    ['myFitnessAge', {}],
    ['myWeRun', { days: 7 }],
    ['myPending', { page: 1 }],
    ['myProcessed', { page: 1 }],
    ['ignoreActivity', { activityId: 'a1' }],
    ['importToCheckin', { activityId: 'a1' }],
  ])('%s → 透传 parse 后 input', async (action, payload) => {
    const app = await authedApp();
    await app.inject({ method: 'POST', url: '/api/device', payload: { action, payload } });
    expect(svc[action]).toHaveBeenCalledWith('u1', payload);
    await app.close();
  });

  // 特殊取参：unbind 取 input.vendor 单独传
  it('unbind → 取 input.vendor 单独传', async () => {
    const app = await authedApp();
    await app.inject({ method: 'POST', url: '/api/device', payload: { action: 'unbind', payload: { vendor: 'garmin' } } });
    expect(mockDeviceService.unbind).toHaveBeenCalledWith('u1', 'garmin');
    await app.close();
  });

  // 特殊取参：syncFromTerra 直接 cast payload（不走 schema）
  it('syncFromTerra → 直接 cast payload（不走 schema）', async () => {
    const app = await authedApp();
    await app.inject({ method: 'POST', url: '/api/device', payload: { action: 'syncFromTerra', payload: { start: '2026-07-01', end: '2026-07-10' } } });
    expect(mockDeviceService.syncFromTerra).toHaveBeenCalledWith('u1', { start: '2026-07-01', end: '2026-07-10' });
    await app.close();
  });
});
