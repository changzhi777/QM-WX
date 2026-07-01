/**
 * admin service 单元测试（V0.1.18）
 *
 * 覆盖：
 * - banUser / unbanUser 边界（用户不存在、已封禁重复 ban、已解封重复 unban）
 * - recordAudit 失败只 log 不 throw
 * - listAuditLogs 时间倒序 + 分页 + 多维筛选
 * - assertNotBanned 抛 403
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('src/infra/prisma.js', () => ({ prisma: mockPrisma }));
// mock middleware feature-gate.ts 引入的 appConfig.findUnique — service 内部不需要,
// 但 routes 的 isAdmin 缓存用,这里禁用它（用 invalidateAdminCache 测试中清）
vi.mock('src/common/middleware/feature-gate.js', () => ({
  invalidateFeatureFlagsCache: () => undefined,
}));

import {
  banUser,
  unbanUser,
  recordAudit,
  listAuditLogs,
  assertNotBanned,
} from '../../../src/modules/admin/admin.service.js';
import { BusinessError } from '../../../src/common/errors.js';

describe('admin.service · banUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('用户不存在 → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(banUser({ openid: 'o-x', reason: 'test' }, 'o-admin-1')).rejects.toThrow(BusinessError);
    try {
      await banUser({ openid: 'o-x', reason: 'test' }, 'o-admin-1');
    } catch (err) {
      expect((err as BusinessError).code).toBe(404);
    }
  });

  it('正常封禁 → update + audit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1', openid: 'o-user-1', isBanned: false, bannedAt: null, bannedReason: null,
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-1' });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });

    const res = await banUser({ openid: 'o-user-1', reason: 'spam' }, 'o-admin-1', '127.0.0.1');

    expect(res).toEqual({ ok: true, alreadyBanned: false });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isBanned: true, bannedAt: expect.any(Date), bannedReason: 'spam' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorOpenid: 'o-admin-1',
        action: 'admin.banUser',
        target: 'o-user-1',
        payload: { reason: 'spam' },
        ip: '127.0.0.1',
      }),
    });
  });

  it('重复封禁已 banned 用户 → 幂等返回（不写 audit）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-1', openid: 'o-user-1', isBanned: true, bannedAt: new Date(), bannedReason: 'old',
    });

    const res = await banUser({ openid: 'o-user-1', reason: 'new' }, 'o-admin-1');

    expect(res).toEqual({ ok: true, alreadyBanned: true });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('admin.service · unbanUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('用户不存在 → 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(unbanUser({ openid: 'o-x' }, 'o-admin-1')).rejects.toThrow(BusinessError);
  });

  it('正常解封 → 清 banned 字段 + 写 audit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-2', openid: 'o-user-2', isBanned: true,
    });
    mockPrisma.user.update.mockResolvedValue({ id: 'u-2' });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 2n });

    const res = await unbanUser({ openid: 'o-user-2' }, 'o-admin-1');

    expect(res).toEqual({ ok: true, alreadyActive: false });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-2' },
      data: { isBanned: false, bannedAt: null, bannedReason: null },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'admin.unbanUser', target: 'o-user-2' }),
    });
  });

  it('解封未 banned 用户 → 幂等', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u-2', openid: 'o-user-2', isBanned: false,
    });
    const res = await unbanUser({ openid: 'o-user-2' }, 'o-admin-1');
    expect(res).toEqual({ ok: true, alreadyActive: true });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('admin.service · recordAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功写入 audit log', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    await recordAudit('admin.test', 'target-1', { k: 'v' }, 'o-admin', '1.2.3.4');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorOpenid: 'o-admin',
        action: 'admin.test',
        target: 'target-1',
        payload: { k: 'v' },
        ip: '1.2.3.4',
      },
    });
  });

  it('DB 失败 → 只 console.error 不 throw', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // 不应抛
    await expect(recordAudit('admin.test', 't', {}, 'o-admin')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit] failed to write audit log:',
      expect.objectContaining({ action: 'admin.test' }),
    );

    consoleSpy.mockRestore();
  });

  it('null target → 存为 null', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 1n });
    await recordAudit('admin.global', null, {}, 'o-admin');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ target: null }),
    });
  });
});

describe('admin.service · listAuditLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('时间倒序 + 分页', async () => {
    const fakeLogs = [
      { id: 100n, actorOpenid: 'o-1', action: 'admin.banUser', target: 'o-x', payload: {}, ip: null, createdAt: new Date() },
      { id: 99n, actorOpenid: 'o-1', action: 'admin.refundOrder', target: 'o-y', payload: {}, ip: null, createdAt: new Date() },
    ];
    mockPrisma.auditLog.findMany.mockResolvedValue(fakeLogs);
    mockPrisma.auditLog.count.mockResolvedValue(2);

    const res = await listAuditLogs({ page: 1, pageSize: 20 });

    expect(res.list).toHaveLength(2);
    expect(res.list[0].id).toBe('100'); // BigInt → string
    expect(res.list[1].id).toBe('99');
    expect(res.total).toBe(2);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { id: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('action + actorOpenid + 日期范围筛选', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await listAuditLogs({
      page: 2,
      pageSize: 10,
      action: 'admin.banUser',
      actorOpenid: 'o-admin-1',
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-06-30T23:59:59Z',
    });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'admin.banUser',
        actorOpenid: 'o-admin-1',
        createdAt: {
          gte: new Date('2026-06-01T00:00:00Z'),
          lte: new Date('2026-06-30T23:59:59Z'),
        },
      },
      orderBy: { id: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('只传 startDate → endDate 不设上限', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    await listAuditLogs({ page: 1, pageSize: 20, startDate: '2026-06-01T00:00:00Z' });

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date('2026-06-01T00:00:00Z') } },
      orderBy: { id: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});

describe('admin.service · assertNotBanned', () => {
  it('isBanned=true → 抛 403', () => {
    expect(() => assertNotBanned({ isBanned: true })).toThrow(BusinessError);
    try {
      assertNotBanned({ isBanned: true });
    } catch (err) {
      expect((err as BusinessError).code).toBe(403);
    }
  });

  it('isBanned=false / undefined / null → 不抛', () => {
    expect(() => assertNotBanned({ isBanned: false })).not.toThrow();
    expect(() => assertNotBanned({})).not.toThrow();
    expect(() => assertNotBanned(null)).not.toThrow();
    expect(() => assertNotBanned(undefined)).not.toThrow();
  });
});