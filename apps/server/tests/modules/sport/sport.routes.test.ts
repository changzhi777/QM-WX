/**
 * sport routes 冒烟测试
 *
 * 目标：把 sport.routes.ts 的 funcs 从 0% 拉到 60%+
 * 策略：覆盖关键 action + parseOrBadRequest 错误分支 + default 分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  today: vi.fn(),
  checkin: vi.fn(),
  myStats: vi.fn(),
  myGroups: vi.fn(),
  createGroup: vi.fn(),
  joinGroup: vi.fn(),
  quitGroup: vi.fn(),
  groupRanking: vi.fn(),
}));
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('src/modules/sport/sport.service.js', () => ({
  sportService: mockService,
}));

vi.mock('src/modules/user/user.repository.js', () => ({
  userRepo: mockUserRepo,
}));

import { sportRoutes } from '../../../src/modules/sport/sport.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

async function buildApp() {
  const app = Fastify();
  // 模拟 auth middleware：直接挂一个装饰器给 req.user
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    (req as { user?: { id: string } }).user = { id: 'u1' };
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(sportRoutes, { prefix: '/api/sport' });
  return app;
}

describe('POST /api/sport action router', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    await app.ready();
  });

  it('action=today → 调 sportService.today', async () => {
    mockService.today.mockResolvedValue({ totalKm: 5 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'today' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.today).toHaveBeenCalledWith('u1');
  });

  it('action=checkin 缺 payload → 400 (parseOrBadRequest)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'checkin', payload: {} },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toMatch(/distance/);
  });

  it('action=checkin 正常 → 调 sportService.checkin', async () => {
    mockService.checkin.mockResolvedValue({ ok: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'checkin', payload: { distance: 5, durationSec: 1800 } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.checkin).toHaveBeenCalledWith('u1', expect.objectContaining({ distance: 5 }));
  });

  it('action=myStats → 调 sportService.myStats', async () => {
    mockService.myStats.mockResolvedValue({});
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'myStats', payload: { days: 7 } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.myStats).toHaveBeenCalled();
  });

  it('action=myGroups → 调 sportService.myGroups', async () => {
    mockService.myGroups.mockResolvedValue([{ id: 'g1' }]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'myGroups' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.groups).toEqual([{ id: 'g1' }]);
  });

  it('action=createGroup 缺 name → 400 (parseOrBadRequest)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'createGroup', payload: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('action=createGroup user 找不到 → notFound', async () => {
    mockUserRepo.findById.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'createGroup', payload: { name: '新群' } },
    });
    expect(res.statusCode).toBe(404);
  });

  it('action=createGroup 正常 → 调 sportService.createGroup', async () => {
    mockUserRepo.findById.mockResolvedValue({ id: 'u1', nickname: '张三' });
    mockService.createGroup.mockResolvedValue({ id: 'g1', name: '新群' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'createGroup', payload: { name: '新群' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.createGroup).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: '新群' }),
      '张三',
    );
  });

  it('action=joinGroup 正常', async () => {
    mockUserRepo.findById.mockResolvedValue({ id: 'u1', nickname: '李四', avatarUrl: 'a' });
    mockService.joinGroup.mockResolvedValue({ ok: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'joinGroup', payload: { groupId: 'g1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.joinGroup).toHaveBeenCalledWith(
      'u1',
      { groupId: 'g1' },
      '李四',
      'a',
    );
  });

  it('action=quitGroup 正常', async () => {
    mockService.quitGroup.mockResolvedValue({ ok: true });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'quitGroup', payload: { groupId: 'g1' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('action=groupRanking 正常', async () => {
    mockService.groupRanking.mockResolvedValue({ ranking: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'groupRanking', payload: { groupId: 'g1' } },
    });
    expect(res.statusCode).toBe(200);
  });

  it('unknown action → 400 with msg', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'something-weird' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toMatch(/unknown action/);
  });

  it('req.user 缺失 → unauthorized', async () => {
    // 新建一个 app 不挂 user
    const app2 = Fastify();
    // 不挂 user 装饰器：req.user undefined
    app2.setErrorHandler((err, _req, reply) => {
      if (err instanceof BusinessError) {
        return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
      }
      return reply.status(500).send({ code: 500, msg: 'unhandled' });
    });
    await app2.register(sportRoutes, { prefix: '/api/sport' });
    await app2.ready();

    const res = await app2.inject({
      method: 'POST',
      url: '/api/sport',
      payload: { action: 'today' },
    });
    expect(res.statusCode).toBe(401);
  });
});
