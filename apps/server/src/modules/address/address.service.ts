/**
 * address module service — 收货地址（V0.1.23）
 *
 * setDefault：事务内先清他处 isDefault 再设当前（保证唯一默认）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { AddressInput } from './address.schema.js';

export const addressService = {
  async list(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  },

  async create(userId: string, input: AddressInput) {
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.create({ data: { userId, ...input } });
    });
  },

  async update(userId: string, id: string, input: AddressInput) {
    const exists = await prisma.address.findFirst({ where: { id, userId } });
    if (!exists) throw Errors.notFound('地址不存在');
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: input });
    });
  },

  async remove(userId: string, id: string) {
    const r = await prisma.address.deleteMany({ where: { id, userId } });
    return { ok: true, deleted: r.count };
  },

  async setDefault(userId: string, id: string) {
    const exists = await prisma.address.findFirst({ where: { id, userId } });
    if (!exists) throw Errors.notFound('地址不存在');
    await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      await tx.address.update({ where: { id }, data: { isDefault: true } });
    });
    return { ok: true };
  },
};
