/**
 * 运动端到端 e2e（in-process fastify + inject）
 *
 * 链路：mock code2Session → POST /api/user login → 拿 JWT
 *      → POST /api/sport createGroup → joinGroup → checkin → groupRanking
 *
 * 用真 PG/Redis（不 mock），跑在 dev server 之外
 *
 * 跑法：RUN_E2E=1 pnpm test
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';

// ===== mock 微信 code2Session =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => {
    if (code === 'invalid') throw new Error('invalid code');
    return { openid: `e2e-flow-${code}`, session_key: 'sk' };
  }),
}));

// 在 import server 之前 mock
const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('运动流程 e2e（HTTP 端到端）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let memberId: string;
  void memberId;
  const GROUP_ID = 'e2e-flow-group-1';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // ===== owner 登录 =====
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: 'owner-code' } },
    });
    expect(ownerLogin.statusCode).toBe(200);
    const ownerBody = ownerLogin.json();
    expect(ownerBody.code).toBe(0);
    ownerToken = ownerBody.data.accessToken;
    ownerId = ownerBody.data.user.id;

    // ===== member 登录 =====
    const memberLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: 'member-code' } },
    });
    expect(memberLogin.statusCode).toBe(200);
    memberToken = memberLogin.json().data.accessToken;
    memberId = memberLogin.json().data.user.id;

    // 清理
    await prisma.checkin.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.groupReport.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.groupMember.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.group.delete({ where: { id: GROUP_ID } }).catch(() => {});
  });

  afterAll(async () => {
    await prisma.checkin.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.groupReport.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.groupMember.deleteMany({ where: { groupId: GROUP_ID } });
    await prisma.group.delete({ where: { id: GROUP_ID } }).catch(() => {});
    await prisma.user.deleteMany({ where: { openid: { startsWith: 'e2e-flow-' } } });
    await app.close();
    await prisma.$disconnect();
  });

  itE2E('建群 → 入群 → 打卡 → 查榜单', async () => {
    // 1. owner 建群
    const create = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'createGroup', payload: { name: 'E2E Flow Group' } },
    });
    expect(create.statusCode).toBe(200);
    const group = create.json().data.group;
    expect(group.name).toBe('E2E Flow Group');
    expect(group.role).toBe('owner');
    // 用 service 端给的 id（cuid），不用我们 hardcode
    const realGroupId = group.id;

    // 2. member 入群
    const join = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { action: 'joinGroup', payload: { groupId: realGroupId } },
    });
    expect(join.statusCode).toBe(200);
    expect(join.json().data.ok).toBe(true);

    // 3. owner 打卡
    const checkin = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'checkin', payload: { distance: 8, groupId: realGroupId } },
    });
    expect(checkin.statusCode).toBe(200);
    expect(checkin.json().data.points).toBe(8);

    // 4. member 打卡
    const memberCheckin = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { action: 'checkin', payload: { distance: 5, groupId: realGroupId } },
    });
    expect(memberCheckin.statusCode).toBe(200);

    // 5. owner 查榜单
    const ranking = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'groupRanking', payload: { groupId: realGroupId, period: 'week' } },
    });
    expect(ranking.statusCode).toBe(200);
    const data = ranking.json().data;
    expect(data.members).toHaveLength(2);
    expect(data.members[0].userId).toBe(ownerId);
    expect(data.members[0].distance).toBe(8);
    expect(data.champion.userId).toBe(ownerId);
    expect(data.totals.memberCount).toBe(2);

    // 清理
    await prisma.checkin.deleteMany({ where: { groupId: realGroupId } });
    await prisma.groupMember.deleteMany({ where: { groupId: realGroupId } });
    await prisma.group.delete({ where: { id: realGroupId } }).catch(() => {});
  });

  itE2E('⚠️ 传 points 字段被服务端忽略', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'createGroup', payload: { name: '防作弊测' } },
    });
    const groupId = create.json().data.group.id;

    const checkin = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'checkin', payload: { distance: 3, points: 9999, groupId } },
    });
    expect(checkin.statusCode).toBe(200);
    // 实际分 = floor(3 × 1) = 3，不是 9999
    expect(checkin.json().data.points).toBe(3);

    // 清理
    await prisma.checkin.deleteMany({ where: { groupId } });
    await prisma.groupMember.deleteMany({ where: { groupId } });
    await prisma.group.delete({ where: { id: groupId } }).catch(() => {});
  });

  itE2E('⚠️ 距离越界被拒', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'checkin', payload: { distance: -1 } },
    });
    expect(r1.statusCode).toBe(400);

    const r2 = await app.inject({
      method: 'POST',
      url: '/api/sport',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { action: 'checkin', payload: { distance: 999 } },
    });
    expect(r2.statusCode).toBe(400);
  });
});
