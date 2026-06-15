/**
 * mall module business logic
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { Cache } from '../../infra/cache.js';
import type { ListProductsInput, ListCategoriesInput } from './mall.schema.js';

/** listProducts 缓存 TTL：60s（商品列表变更不频繁，60s 容忍商品上新延迟） */
const LIST_PRODUCTS_CACHE_TTL_SEC = 60;
const listProductsCacheKey = (input: ListProductsInput) =>
  `mall:listProducts:${input.category ?? ''}:${input.brand ?? ''}:${input.keyword ?? ''}:${input.page}:${input.pageSize}`;

export const mallService = {
  /**
   * 分类列表（从商品表聚合 distinct category）
   */
  async listCategories(input: ListCategoriesInput) {
    if (input.includeCount) {
      const rows = await prisma.product.groupBy({
        by: ['category'],
        where: { status: 'on' },
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
      });
      return {
        categories: rows.map((r) => ({
          name: r.category,
          count: r._count.category,
        })),
      };
    }
    // 轻量查询：只拿 distinct category
    const rows = await prisma.product.findMany({
      where: { status: 'on' },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return { categories: rows.map((r) => ({ name: r.category, count: 0 })) };
  },

  /**
   * 商品列表（带缓存）
   *
   * 缓存策略：Cache.wrap + 60s TTL + key 含分页/分类/品牌/关键词组合
   * - 命中：~0.5ms（公开端点，QPS 高，免 DB 命中）
   * - 未命中：1 findMany + 1 count 并行 + 写回缓存
   * - 写商品（admin.upsertProduct）后用 delByPattern('mall:listProducts:*') 抹全部分页
   * - cache fail-open：Redis 挂掉时静默降级直查 DB
   */
  async listProducts(input: ListProductsInput) {
    return Cache.wrap(listProductsCacheKey(input), LIST_PRODUCTS_CACHE_TTL_SEC, async () => {
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
    });
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

/**
 * 商品写后失效工具（admin.upsertProduct 调用）
 * 用 SCAN 抹掉所有分页/分类/品牌/关键词组合的缓存
 * 失败静默 — 商品写操作不应被缓存清理失败阻塞
 */
export async function invalidateProductsCache(): Promise<number> {
  return Cache.delByPattern('mall:listProducts:*');
}
