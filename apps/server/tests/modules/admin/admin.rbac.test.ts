/**
 * admin RBAC 权限矩阵 + 登录单测（V0.2.8）
 * - checkPermission：3 角色 × action 边界（纯函数，无 mock）
 * - adminLogin：bcrypt verify + JWT + 登录日志（mock prisma/bcrypt/app.jwt）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    admin: { findUnique: vi.fn(), update: vi.fn() },
    adminLoginLog: { create: vi.fn() },
  },
}));

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { prisma } from 'src/infra/prisma.js';
import bcrypt from 'bcrypt';
import { checkPermission, adminLogin } from 'src/modules/admin/admin.service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedBcrypt = vi.mocked(bcrypt);

const fakeApp = {
  jwt: { sign: vi.fn(() => 'fake-admin-jwt') },
} as unknown as Parameters<typeof adminLogin>[0];

beforeEach(() => vi.clearAllMocks());

// ===== checkPermission 纯函数（3 角色 × action 边界）=====
describe('checkPermission RBAC 矩阵', () => {
  it('super-admin: 全部通过（含账号管理+配置）', () => {
    expect(checkPermission('super-admin', 'createAdmin')).toBe(true);
    expect(checkPermission('super-admin', 'setConfig')).toBe(true);
    expect(checkPermission('super-admin', 'listUsers')).toBe(true);
    expect(checkPermission('super-admin', 'refundOrder')).toBe(true);
  });

  it('admin: 运营通过，账号管理+全局配置拒', () => {
    expect(checkPermission('admin', 'listUsers')).toBe(true);
    expect(checkPermission('admin', 'refundOrder')).toBe(true);
    expect(checkPermission('admin', 'adjustPoints')).toBe(true);
    expect(checkPermission('admin', 'upsertContent')).toBe(true);
    // 拒
    expect(checkPermission('admin', 'createAdmin')).toBe(false);
    expect(checkPermission('admin', 'updateAdmin')).toBe(false);
    expect(checkPermission('admin', 'setConfig')).toBe(false);
    expect(checkPermission('admin', 'adminLoginLogs')).toBe(false);
  });

  it('operator: 只读+轻操作通过，改内容/退款/调积分拒', () => {
    // 通过
    expect(checkPermission('operator', 'listUsers')).toBe(true);
    expect(checkPermission('operator', 'listOrders')).toBe(true);
    expect(checkPermission('operator', 'banUser')).toBe(true);
    expect(checkPermission('operator', 'confirmPickup')).toBe(true);
    expect(checkPermission('operator', 'exportOrders')).toBe(true);
    // 拒
    expect(checkPermission('operator', 'upsertContent')).toBe(false);
    expect(checkPermission('operator', 'refundOrder')).toBe(false);
    expect(checkPermission('operator', 'adjustPoints')).toBe(false);
    expect(checkPermission('operator', 'grantMember')).toBe(false);
    expect(checkPermission('operator', 'createAdmin')).toBe(false);
  });

  it('未知角色: 全拒', () => {
    expect(checkPermission('unknown', 'listUsers')).toBe(false);
    expect(checkPermission('hacker', 'createAdmin')).toBe(false);
  });
});

// ===== adminLogin（bcrypt verify + JWT + 日志）=====
describe('adminLogin', () => {
  it('正确密码 → 签 JWT + 写成功日志', async () => {
    mockedPrisma.admin.findUnique.mockResolvedValue({
      id: 'a1',
      username: 'root',
      passwordHash: 'hash',
      role: 'super-admin',
      nickname: '超管',
      disabled: false,
    } as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);

    const result = await adminLogin(fakeApp, 'root', 'correct-pwd', { ip: '1.2.3.4' });

    expect(result.accessToken).toBe('fake-admin-jwt');
    expect(result.admin).toEqual({ id: 'a1', username: 'root', role: 'super-admin', nickname: '超管' });
    expect(mockedPrisma.adminLoginLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminId: 'a1', ip: '1.2.3.4', ok: true }) }),
    );
  });

  it('错误密码 → 抛 unauthorized + 写失败日志', async () => {
    mockedPrisma.admin.findUnique.mockResolvedValue({
      id: 'a2',
      username: 'admin',
      passwordHash: 'hash',
      role: 'admin',
      disabled: false,
    } as never);
    mockedBcrypt.compare.mockResolvedValue(false as never);

    await expect(adminLogin(fakeApp, 'admin', 'wrong')).rejects.toThrow();
    expect(mockedPrisma.adminLoginLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminId: 'a2', ok: false }) }),
    );
  });

  it('账号不存在 → 抛错（不写日志，无 adminId）', async () => {
    mockedPrisma.admin.findUnique.mockResolvedValue(null as never);
    await expect(adminLogin(fakeApp, 'ghost', 'x')).rejects.toThrow();
    expect(mockedPrisma.adminLoginLog.create).not.toHaveBeenCalled();
  });

  it('禁用账号 → 抛错', async () => {
    mockedPrisma.admin.findUnique.mockResolvedValue({
      id: 'a3',
      username: 'blocked',
      passwordHash: 'h',
      role: 'operator',
      disabled: true,
    } as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
    await expect(adminLogin(fakeApp, 'blocked', 'ok')).rejects.toThrow();
  });
});
