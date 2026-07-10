/**
 * content module business logic
 *
 * 关键原则（02 §5.4 + 04 §T3-6）：
 * - 5 类内容（marathon/hotel/scenic/food/rural）走同一套表 + action
 * - enroll **仅登记意向**，不收钱（支付未开通）
 * - 列表分页 + 按 type 过滤
 *
 * 缓存策略（V0.1.10 增）：
 * - list / detail 均为公开端点（游客可看），QPS 高，走 Cache.wrap
 * - price/fee 是 Decimal? → 进缓存前显式 toString 序列化（对齐 mall，
 *   避免 Decimal 经 JSON.stringify 损坏 + 保证缓存 hit/miss 返回类型一致）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { Cache } from '../../infra/cache.js';
import type {
  ContentListInput,
  ContentEnrollInput,
  ContentMyEnrollmentsInput,
} from './content.schema.js';

/** list 缓存 TTL：60s（内容列表变更不频繁，公开热路径，60s 容忍内容上新延迟） */
const LIST_CACHE_TTL_SEC = 60;
const listCacheKey = (input: ContentListInput) =>
  `content:list:${input.type ?? ''}:${input.page}:${input.pageSize}`;

/** detail 缓存 TTL：5min（内容详情变更极少，公开热路径，5min 长 TTL） */
const DETAIL_CACHE_TTL_SEC = 300;
const detailCacheKey = (id: string) => `content:detail:${id}`;

export const contentService = {
  /**
   * 内容列表（带缓存，V0.1.10 增）
   *
   * 缓存策略：Cache.wrap + 60s TTL + key 含 type/分页组合
   * - 命中：~0.5ms（公开端点，QPS 高，免 DB 命中）
   * - 未命中：1 findMany + 1 count 并行 + 写回缓存
   * - 写内容（admin.upsertContent）后用 invalidateContentsCache() 抹全 list 分页
   * - cache fail-open：Redis 挂掉时静默降级直查 DB
   */
  async list(input: ContentListInput) {
    return Cache.wrap(listCacheKey(input), LIST_CACHE_TTL_SEC, async () => {
      const where = {
        status: 'on',
        ...(input.type ? { type: input.type } : {}),
      };
      const [list, total] = await Promise.all([
        prisma.content.findMany({
          where,
          orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: {
            id: true,
            type: true,
            title: true,
            cover: true,
            summary: true,
            price: true,
            fee: true,
            date: true,
            location: true,
            tags: true,
            actionType: true,
          },
        }),
        prisma.content.count({ where }),
      ]);
      // price/fee Decimal? → string 序列化（进缓存必须，否则 JSON.stringify 损坏）
      const serialized = list.map((c) => ({
        ...c,
        price: c.price?.toString() ?? null,
        fee: c.fee?.toString() ?? null,
      }));
      return { list: serialized, total, page: input.page, pageSize: input.pageSize };
    });
  },

  /**
   * 内容详情（V0.1.10 增 Cache.wrap）
   *
   * 缓存策略：Cache.wrap + 5min TTL
   * - 命中：~0.5ms（公开端点，QPS 高）
   * - 未命中：1 DB + 写回缓存
   * - 写后失效：admin.upsertContent 调 invalidateContentDetail(id) 精准单 key（不等 TTL）
   * - 异常不缓存：不存在 / 已下架 → 抛 notFound，Cache.wrap propagate（防穿透）
   * - cache fail-open：Redis 挂掉静默降级直查 DB
   */
  async detail(id: string) {
    return Cache.wrap(detailCacheKey(id), DETAIL_CACHE_TTL_SEC, async () => {
      const content = await prisma.content.findUnique({ where: { id } });
      if (!content) throw Errors.notFound('内容不存在');
      if (content.status !== 'on') throw Errors.notFound('内容已下架');
      // price/fee Decimal? → string 序列化（缓存前后类型一致）
      return {
        content: {
          ...content,
          price: content.price?.toString() ?? null,
          fee: content.fee?.toString() ?? null,
        },
      };
    });
  },

  /**
   * 报名/登记意向
   *
   * ⚠️ 当前阶段：仅写 enrollments 表，**不收钱**
   * 支付开关打开后，再在 admin 端做审核 → 收款
   */
  async enroll(userId: string, input: ContentEnrollInput) {
    const content = await prisma.content.findUnique({ where: { id: input.id } });
    if (!content) throw Errors.notFound('内容不存在');
    if (content.status !== 'on') throw Errors.forbidden('该内容已下架');
    if (content.actionType === 'none') {
      throw Errors.forbidden('该内容仅展示，不接受报名');
    }

    // 防重复：同 user + 同 content 已 submitted/confirmed 不再录
    const existing = await prisma.enrollment.findFirst({
      where: {
        userId,
        contentId: input.id,
        status: { in: ['submitted', 'confirmed'] },
      },
    });
    if (existing) throw Errors.conflict('你已提交过意向，请勿重复');

    const enrollment = await prisma.enrollment.create({
      data: {
        userId,
        contentId: input.id,
        type: content.type,
        formData: input.formData,
        status: 'submitted',
      },
    });

    return {
      enrollmentId: enrollment.id,
      message: '意向已提交，客服会尽快联系您',
    };
  },

  /**
   * 我的报名记录（赛事/酒店/景区等，按 type 过滤，含 Content 详情）
   */
  async myEnrollments(userId: string, input: ContentMyEnrollmentsInput) {
    const where = {
      userId,
      ...(input.type ? { type: input.type } : {}),
    };
    const [list, total] = await Promise.all([
      prisma.enrollment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          content: {
            select: { id: true, title: true, cover: true, type: true, date: true, location: true },
          },
        },
      }),
      prisma.enrollment.count({ where }),
    ]);
    return {
      list: list.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
        content: e.content,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  },
};

/**
 * 内容写后失效工具（admin.upsertContent 调用）
 * 用 SCAN 抹掉 content:* 命名空间所有缓存（list 全分页 + detail 全 id）
 * 失败静默 — 内容写操作不应被缓存清理失败阻塞
 */
export async function invalidateContentsCache(): Promise<number> {
  return Cache.delByPattern('content:*');
}

/**
 * 单内容精准失效（admin.upsertContent 调用）
 * 抹掉单个 contentId 的详情缓存（不等 5min TTL）
 * 失败静默
 */
export async function invalidateContentDetail(contentId: string): Promise<number> {
  return Cache.del(detailCacheKey(contentId)).then(() => 1);
}
