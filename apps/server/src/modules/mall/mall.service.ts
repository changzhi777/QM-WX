/**
 * mall module business logic
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { ListProductsInput } from './mall.schema.js';

export const mallService = {
  async listProducts(input: ListProductsInput) {
    const where = {
      status: 'on',
      ...(input.category ? { category: input.category } : {}),
      ...(input.brand ? { brand: input.brand } : {}),
      ...(input.keyword
        ? { name: { contains: input.keyword, mode: 'insensitive' as const } }
        : {}),
    };
    const [list, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          category: true,
          brand: true,
          price: true,
          originalPrice: true,
          memberDiscount: true,
          images: true,
          description: true,
          stock: true,
        },
      }),
      prisma.product.count({ where }),
    ]);
    // price Decimal → string 序列化
    const serialized = list.map((p) => ({
      ...p,
      price: p.price.toString(),
      originalPrice: p.originalPrice?.toString() ?? null,
    }));
    return { list: serialized, total, page: input.page, pageSize: input.pageSize };
  },

  async productDetail(id: string) {
    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) throw Errors.notFound('商品不存在');
    if (p.status !== 'on') throw Errors.notFound('商品已下架');
    return {
      product: {
        ...p,
        price: p.price.toString(),
        originalPrice: p.originalPrice?.toString() ?? null,
      },
    };
  },
};
