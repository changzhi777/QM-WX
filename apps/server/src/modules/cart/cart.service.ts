/**
 * cart module service — 购物车（跨设备持久化，V0.1.22 B-核心）
 *
 * 数据来源：Cart 表（userId+productId unique，同商品合并 qty）
 * Decimal：price 是 Decimal，合计用 decimal.js
 * 参考：pic/2765 购物车
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { CartAddInput, CartUpdateQtyInput } from './cart.schema.js';

export const cartService = {
  /** 加购（同商品 qty 累加，upsert） */
  async add(userId: string, input: CartAddInput) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) throw Errors.notFound('商品不存在');
    if (product.status !== 'on') throw Errors.badRequest('商品已下架');

    const cart = await prisma.cart.upsert({
      where: { userId_productId: { userId, productId: input.productId } },
      create: { userId, productId: input.productId, qty: input.qty },
      update: { qty: { increment: input.qty } },
    });
    return { productId: cart.productId, qty: cart.qty };
  },

  /** 移除单商品 */
  async remove(userId: string, productId: string) {
    const r = await prisma.cart.deleteMany({ where: { userId, productId } });
    return { ok: true, deleted: r.count };
  },

  /** 列表（join Product 取价/图/库存 + 算合计） */
  async list(userId: string) {
    const items = await prisma.cart.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true, name: true, price: true, originalPrice: true,
            memberDiscount: true, images: true, stock: true, status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalAmount = 0;
    const list = items.map((i) => {
      if (i.product.status === 'on') {
        totalAmount += Number(i.product.price) * i.qty;
      }
      return {
        productId: i.productId,
        qty: i.qty,
        product: {
          ...i.product,
          price: i.product.price.toString(),
          originalPrice: i.product.originalPrice?.toString() ?? null,
        },
      };
    });

    return {
      items: list,
      totalAmount: totalAmount.toFixed(2),
      count: items.reduce((s, i) => s + i.qty, 0),
    };
  },

  /** 改数量（qty<=0 则移除） */
  async updateQty(userId: string, input: CartUpdateQtyInput) {
    if (input.qty <= 0) return this.remove(userId, input.productId);
    const cart = await prisma.cart.update({
      where: { userId_productId: { userId, productId: input.productId } },
      data: { qty: input.qty },
    });
    return { productId: cart.productId, qty: cart.qty };
  },

  /** 清空 */
  async clear(userId: string) {
    const r = await prisma.cart.deleteMany({ where: { userId } });
    return { ok: true, deleted: r.count };
  },
};
