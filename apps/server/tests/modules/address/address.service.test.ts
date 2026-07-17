/**
 * address.service 单测（V0.1.23）
 * - setDefault：事务先清他处 isDefault 再设当前
 * - create：isDefault 时清他处
 * - remove：按 userId+id
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    address: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { addressService } from 'src/modules/address/address.service.js';

const mockedPrisma = vi.mocked(prisma);
const mockAddr = { name: '张三', phone: '13800138000', province: '湖南', city: '长沙', district: '岳麓', detail: 'xx 路', isDefault: true };

beforeEach(() => vi.clearAllMocks());

describe('addressService.setDefault', () => {
  it('先清他处 isDefault 再设当前（事务）', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1' } as never);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ address: { updateMany, update } }));

    const r = await addressService.setDefault('u1', 'a1');
    expect(r.ok).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', isDefault: true }, data: { isDefault: false } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { isDefault: true } });
  });

  it('地址不存在抛错', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue(null as never);
    await expect(addressService.setDefault('u1', 'x')).rejects.toThrow();
  });
});

describe('addressService.create', () => {
  it('isDefault=true 时清他处再创建', async () => {
    const updateMany = vi.fn().mockResolvedValue({});
    const create = vi.fn().mockResolvedValue({ id: 'a1' });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ address: { updateMany, create } }));

    const r = await addressService.create('u1', mockAddr as never);
    expect(r).toEqual({ id: 'a1' });
    expect(updateMany).toHaveBeenCalled();
  });
});

describe('addressService.remove', () => {
  it('按 userId+id 删除', async () => {
    mockedPrisma.address.deleteMany.mockResolvedValue({ count: 1 } as never);
    const r = await addressService.remove('u1', 'a1');
    expect(r.deleted).toBe(1);
    expect(mockedPrisma.address.deleteMany).toHaveBeenCalledWith({ where: { id: 'a1', userId: 'u1' } });
  });
});

// V0.2.22 funcs% 加固：补 list + update（原 60% 缺口）
describe('addressService.list', () => {
  it('返列表 + orderBy（isDefault desc 置顶 + updatedAt desc）', async () => {
    const list = [
      { id: 'a1', isDefault: true },
      { id: 'a2', isDefault: false },
    ];
    mockedPrisma.address.findMany.mockResolvedValue(list as never);
    const r = await addressService.list('u1');
    expect(r).toEqual(list);
    expect(mockedPrisma.address.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  });
});

describe('addressService.update', () => {
  it('isDefault=true → 清他处再更新（事务）', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1' } as never);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({ id: 'a1', updated: true });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ address: { updateMany, update } }));

    const r = await addressService.update('u1', 'a1', mockAddr as never);
    expect(r).toEqual({ id: 'a1', updated: true });
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1', isDefault: true }, data: { isDefault: false } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: mockAddr });
  });

  it('isDefault=false → 不清他处，仅 update', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue({ id: 'a1', userId: 'u1' } as never);
    const updateMany = vi.fn();
    const update = vi.fn().mockResolvedValue({ id: 'a1' });
    mockedPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ address: { updateMany, update } }));

    const input = { ...mockAddr, isDefault: false };
    const r = await addressService.update('u1', 'a1', input as never);
    expect(r).toEqual({ id: 'a1' });
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: input });
  });

  it('地址不存在 → 抛 notFound', async () => {
    mockedPrisma.address.findFirst.mockResolvedValue(null as never);
    await expect(addressService.update('u1', 'x', mockAddr as never)).rejects.toThrow(/地址不存在/);
  });
});
