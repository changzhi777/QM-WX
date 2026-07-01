/**
 * admin 审计 + 黑名单 e2e（V0.1.18，in-process fastify + inject）
 *
 * 3 个 e2e：
 * 1. ban → 下单 403（黑名单拦截）
 * 2. audit log 时间倒序 + 多维筛选
 * 3. setConfig 留痕可见 + audit log 写入
 *
 * 数据隔离：prefix `e2e-audit-` + afterAll 强清
 *
 * 跑法：RUN_E2E=1 pnpm test admin-audit
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';

const E2E_USER_CODE = 'e2e-audit-user';
const E2E_OPENID = `e2e-audit-${E2E_USER_CODE}`;
const E2E_ADMIN_CODE = 'e2e-audit-admin';
const E2E_ADMIN_OPENID = `e2e-audit-${E2E_ADMIN_CODE}`;
const E2E_PRODUCT_ID = 'e2e-audit-product';

vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => ({
    openid: `e2e-audit-${code}`,
    session_key: 'sk-audit',
  })),
}));

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('admin 审计 + 黑名单 e2e', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userToken: string;
  let userId: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. 准备商品
    await prisma.product.upsert({
      where: { id: E2E_PRODUCT_ID },
      create: {
        id: E2E_PRODUCT_ID,
        name: 'e2e 审计商品',
        category: 'cat-audit',
        price: 1 as never,
        images: [],
        stock: 100,
        status: 'on',
        sort: 0,
      },
      update: { status: 'on' },
    });

    // 2. 普通用户登录
    const userLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_USER_CODE } },
    });
    expect(userLogin.statusCode).toBe(200);
    userToken = userLogin.json().data.accessToken;
    userId = userLogin.json().data.user.id;

    // 3. 管理员登录 + 加入白名单
    await prisma.user.upsert({
      where: { openid: E2E_ADMIN_OPENID },
      create: { openid: E2E_ADMIN_OPENID, nickname: 'e2e-admin', stats: {} as never },
      update: {},
    });
    await prisma.appConfig.upsert({
      where: { id: 'admin_whitelist' },
      create: { id: 'admin_whitelist', value: { openids: [E2E_ADMIN_OPENID] } as never },
      update: { value: { openids: [E2E_ADMIN_OPENID] } as never },
    });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_ADMIN_CODE } },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminToken = adminLogin.json().data.accessToken;

    // 给 user 加积分（黑名单前能下单 = baseline）
    await prisma.user.update({
      where: { id: userId },
      data: { points: 200, isBanned: false, bannedAt: null, bannedReason: null },
    });
  });

  afterAll(async () => {
    // 强清
    await prisma.orderItem.deleteMany({ where: { order: { userId } } });
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.pointsRecord.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { actorOpenid: E2E_ADMIN_OPENID } });
    await prisma.product.delete({ where: { id: E2E_PRODUCT_ID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_OPENID } }).catch(() => {});
    await prisma.user.delete({ where: { openid: E2E_ADMIN_OPENID } }).catch(() => {});
    await app.close();
  });

  itE2E('① ban → 普通用户下单 403', async () => {
    // admin ban
    const banRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'banUser',
        payload: { openid: E2E_OPENID, reason: 'e2e-test-ban' },
      },
    });
    expect(banRes.statusCode).toBe(200);
    expect(banRes.json().data).toMatchObject({ ok: true, alreadyBanned: false });

    // user 尝试下单（积分兑换）→ 应被 403 拦
    const orderRes = await app.inject({
      method: 'POST',
      url: '/api/mall',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {
        action: 'createOrder',
        payload: {
          items: [{ productId: E2E_PRODUCT_ID, qty: 1 }],
          pointsUsed: 50,
          address: { name: 'e2e', phone: '13800000000', detail: '测试地址' },
        },
      },
    });
    expect(orderRes.statusCode).toBe(403);
    expect(orderRes.json().msg).toMatch(/封禁|禁用/);

    // 解封以便后续测试
    const unbanRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'unbanUser', payload: { openid: E2E_OPENID } },
    });
    expect(unbanRes.json().data.ok).toBe(true);
  });

  itE2E('② audit log 时间倒序 + 筛选', async () => {
    // 触发一次 setConfig 留痕
    const setRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'setConfig',
        payload: { id: 'feature_flags', value: { payment: false, wallet: false } },
      },
    });
    expect(setRes.statusCode).toBe(200);

    // 列 audit log（admin 应该至少看到 1 条 setConfig）
    const listRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'listAuditLogs',
        payload: { page: 1, pageSize: 20, actorOpenid: E2E_ADMIN_OPENID },
      },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json().data.list;
    expect(list.length).toBeGreaterThan(0);

    // 时间倒序：第 1 条 id 最大（BigInt → string 比较）
    const ids = list.map((l: { id: string }) => BigInt(l.id));
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1] >= ids[i]).toBe(true);
    }

    // 至少有 1 条 setConfig 记录
    const setConfigLogs = list.filter((l: { action: string }) => l.action === 'admin.setConfig');
    expect(setConfigLogs.length).toBeGreaterThan(0);
    expect(setConfigLogs[0].target).toBe('feature_flags');
    expect(setConfigLogs[0].payload).toMatchObject({ id: 'feature_flags' });
  });

  itE2E('③ 重复 ban 已 banned 用户 → 幂等（不写 audit）', async () => {
    // 第一次 ban
    await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'banUser', payload: { openid: E2E_OPENID, reason: 'first' } },
    });

    // 计数：当前 audit banUser 记录数
    const beforeRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'listAuditLogs',
        payload: { page: 1, pageSize: 100, action: 'admin.banUser' },
      },
    });
    const beforeCount = beforeRes.json().data.total;

    // 第二次 ban（已 banned）
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'banUser', payload: { openid: E2E_OPENID, reason: 'second' } },
    });
    expect(res2.json().data).toMatchObject({ ok: true, alreadyBanned: true });

    // 计数：应不变（幂等）
    const afterRes = await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'listAuditLogs',
        payload: { page: 1, pageSize: 100, action: 'admin.banUser' },
      },
    });
    expect(afterRes.json().data.total).toBe(beforeCount);

    // 清理
    await app.inject({
      method: 'POST',
      url: '/api/admin',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'unbanUser', payload: { openid: E2E_OPENID } },
    });
  });
});