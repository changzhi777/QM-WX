/**
 * family routes 路由层测试（V0.1.112 GAP-3.5）
 *
 * 覆盖 9 action + 鉴权 + 未知 action 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockFamilyService = vi.hoisted(() => ({
  createFamily: vi.fn(),
  joinFamily: vi.fn(),
  myFamily: vi.fn(),
  leaveFamily: vi.fn(),
  familyRanking: vi.fn(),
  inviteInfo: vi.fn(),
  transferOwner: vi.fn(),
  dissolveFamily: vi.fn(),
  familyAchievements: vi.fn(),
}));

vi.mock('src/modules/family/family.service.js', () => ({ familyService: mockFamilyService }));
vi.mock('src/modules/family/family.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    CreateFamilySchema: passthrough,
    JoinFamilySchema: passthrough,
    FamilyRankingSchema: passthrough,
    TransferOwnerSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
    conflict: (msg: string) => Object.assign(new Error(msg), { code: 409, statusCode: 409 }),
  },
}));

import { familyRoutes } from '../../../src/modules/family/family.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(opts: { authed?: boolean } = {}) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (opts.authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(familyRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('family routes', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'myFamily' } });
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

  it('createFamily → 透传 input', async () => {
    mockFamilyService.createFamily.mockResolvedValue({ id: 'f1', inviteCode: 'ABCDEF12' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'createFamily', payload: { name: '我家' } },
    });
    expect(mockFamilyService.createFamily).toHaveBeenCalledWith('u1', { name: '我家' });
    await app.close();
  });

  it('joinFamily → 透传 inviteCode input', async () => {
    mockFamilyService.joinFamily.mockResolvedValue({ id: 'f1', name: '我家' });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'joinFamily', payload: { inviteCode: 'ABCDEF12' } },
    });
    expect(mockFamilyService.joinFamily).toHaveBeenCalledWith('u1', { inviteCode: 'ABCDEF12' });
    await app.close();
  });

  it('myFamily → 返家庭详情', async () => {
    mockFamilyService.myFamily.mockResolvedValue({ family: null });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'myFamily' } });
    expect(mockFamilyService.myFamily).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('leaveFamily → 返 ok', async () => {
    mockFamilyService.leaveFamily.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'leaveFamily' } });
    expect(mockFamilyService.leaveFamily).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('familyRanking → 透传 period input', async () => {
    mockFamilyService.familyRanking.mockResolvedValue({ ranking: [] });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'familyRanking', payload: { period: 'month' } },
    });
    expect(mockFamilyService.familyRanking).toHaveBeenCalledWith('u1', { period: 'month' });
    await app.close();
  });

  it('inviteInfo → 返邀请信息', async () => {
    mockFamilyService.inviteInfo.mockResolvedValue({ name: '我家', inviteCode: 'ABCDEF12' });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'inviteInfo' } });
    expect(mockFamilyService.inviteInfo).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('transferOwner → 透传 newOwnerId input', async () => {
    mockFamilyService.transferOwner.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'transferOwner', payload: { newOwnerId: 'u2' } },
    });
    expect(mockFamilyService.transferOwner).toHaveBeenCalledWith('u1', { newOwnerId: 'u2' });
    await app.close();
  });

  it('dissolveFamily → 返 ok', async () => {
    mockFamilyService.dissolveFamily.mockResolvedValue({ ok: true });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'dissolveFamily' } });
    expect(mockFamilyService.dissolveFamily).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('familyAchievements → 返成就', async () => {
    mockFamilyService.familyAchievements.mockResolvedValue({ achievements: [] });
    const app = await buildApp({ authed: true });
    await app.inject({ method: 'POST', url: '/', payload: { action: 'familyAchievements' } });
    expect(mockFamilyService.familyAchievements).toHaveBeenCalledWith('u1');
    await app.close();
  });
});
