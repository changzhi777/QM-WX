/**
 * admin module — 内容 / 商品 / 订单 / 配置管理
 *
 * POST /api/admin
 * 鉴权：openid 必须出现在 AppConfig.admin_whitelist
 *
 * Action:
 * - upsertContent      { id?, type, title, ... }
 * - upsertProduct      { id?, name, category, price, ... }
 * - setConfig          { id: 'feature_flags' | 'member_levels' | 'points_rules', value }
 * - listOrders         { status?, page?, pageSize? }
 * - updateOrderStatus  { orderId, status }
 * - refundOrder        { orderId, amountFen?, reason? }
 * - listAdmins         {}
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../infra/prisma.js';
import { refundService } from '../mall/refund.service.js';
import { invalidateProductsCache, invalidateProductDetail } from '../mall/mall.service.js';
import { invalidateContentsCache, invalidateContentDetail } from '../content/content.service.js';
import { Errors } from '../../common/errors.js';
import { featureGatePlugin, invalidateFeatureFlagsCache } from '../../common/middleware/feature-gate.js';
import { CONTENT_TYPES } from '../content/content.schema.js';
import { assertTransition, type OrderStatus } from '../../domain/order-state.js';

const UpsertContentSchema = z.object({
  id: z.string().optional(),
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(128),
  cover: z.string().optional(),
  summary: z.string().max(500).optional(),
  detail: z.unknown().optional(),
  price: z.number().optional(),
  fee: z.number().optional(),
  date: z.string().optional(),
  validRange: z.unknown().optional(),
  location: z.string().max(128).optional(),
  tags: z.array(z.string()).optional(),
  actionType: z.enum(['enroll', 'book', 'link', 'none']).default('none'),
  status: z.enum(['on', 'off']).default('on'),
  sort: z.number().int().default(0),
});

const UpsertProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(128),
  category: z.string().min(1).max(32),
  brand: z.string().max(64).optional(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  memberDiscount: z.number().min(0).max(1).optional(),
  images: z.array(z.string()).default([]),
  description: z.string().max(2000).optional(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(['on', 'off']).default('on'),
  sort: z.number().int().default(0),
});

const SetConfigSchema = z.object({
  id: z.enum(['feature_flags', 'member_levels', 'points_rules']),
  value: z.record(z.unknown()),
});

const ListOrdersSchema = z.object({
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const UpdateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['pending_pay', 'paid', 'shipped', 'done', 'cancelled']),
});

const RefundOrderSchema = z.object({
  orderId: z.string().min(1),
  /** 退款金额（分）— 缺省 = order.payAmount 全额 */
  amountFen: z.number().int().positive().max(10_000_000).optional(),
  reason: z.string().max(80).optional(),
});

async function isAdmin(openid: string): Promise<boolean> {
  // TTL 兜底：多实例部署时本进程的 invalidateAdminCache 不会通知其它实例，
  // 用短 TTL 保证白名单变更最迟 ADMIN_CACHE_TTL_MS 内全实例生效。
  const now = Date.now();
  if (!_adminCache || now - _adminCacheAt > ADMIN_CACHE_TTL_MS) {
    const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
    _adminCache = (row?.value as { openids?: string[] } | undefined)?.openids ?? [];
    _adminCacheAt = now;
  }
  return _adminCache.includes(openid);
}

/** admin 白名单内存缓存，setConfig 改 admin_whitelist 时主动失效 + TTL 兜底 */
let _adminCache: string[] | null = null;
let _adminCacheAt = 0;
const ADMIN_CACHE_TTL_MS = 60_000;

/** 外部调用：清缓存，下次 isAdmin 查询时重读 DB */
export function invalidateAdminCache(): void {
  _adminCache = null;
  _adminCacheAt = 0;
}

export async function adminRoutes(app: FastifyInstance) {
  // 应用 featureGatePlugin（auth 已挂）
  await app.register(featureGatePlugin);

  app.post(
    '/',
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      if (!(await isAdmin(req.user.openid))) {
        return reply.status(403).send({ code: 403, msg: 'admin only' });
      }

      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'upsertContent': {
          const input = UpsertContentSchema.parse(payload);
          const data = {
            type: input.type,
            title: input.title,
            cover: input.cover,
            summary: input.summary,
            detail: input.detail as never,
            price: input.price as never,
            fee: input.fee as never,
            date: input.date,
            validRange: input.validRange as never,
            location: input.location,
            tags: input.tags ?? [],
            actionType: input.actionType,
            status: input.status,
            sort: input.sort,
          };
          const content = input.id
            ? await prisma.content.update({ where: { id: input.id }, data })
            : await prisma.content.create({ data });
          // 写后失效：抹掉 content 列表全分页 + 该 id 详情缓存（不等 TTL）
          await invalidateContentsCache();
          if (input.id) {
            await invalidateContentDetail(input.id);
          }
          return { code: 0, data: { id: content.id } };
        }

        case 'upsertProduct': {
          const input = UpsertProductSchema.parse(payload);
          const data = {
            name: input.name,
            category: input.category,
            brand: input.brand,
            price: input.price as never,
            originalPrice: input.originalPrice as never,
            memberDiscount: input.memberDiscount,
            images: input.images,
            description: input.description,
            stock: input.stock,
            status: input.status,
            sort: input.sort,
          };
          const product = input.id
            ? await prisma.product.update({ where: { id: input.id }, data })
            : await prisma.product.create({ data });
          // V0.1.6: 写后抹掉所有 listProducts 缓存（分页/分类/品牌/关键词组合）
          // V0.1.9: 写更新时精准失效 productDetail 缓存（不等 5min TTL）
          // 失败静默 — 商品写成功是大事，缓存清理失败不等
          await invalidateProductsCache();
          if (input.id) {
            await invalidateProductDetail(input.id);
          }
          return { code: 0, data: { id: product.id } };
        }

        case 'setConfig': {
          const input = SetConfigSchema.parse(payload);
          await prisma.appConfig.upsert({
            where: { id: input.id },
            create: { id: input.id, value: input.value as never },
            update: { value: input.value as never },
          });
          // feature_flags / admin_whitelist 变更时主动清缓存，无需重启
          if (input.id === 'feature_flags') {
            invalidateFeatureFlagsCache();
          }
          // admin_whitelist 通过 setConfig 修改时也要清 admin 缓存
          // 但 setConfig schema 当前不允许 admin_whitelist（id enum 限定），
          // 留口子：如未来 schema 扩展支持，立即生效
          // @ts-expect-error narrowing for future expansion
          if (input.id === 'admin_whitelist') {
            invalidateAdminCache();
          }
          return { code: 0, data: { ok: true } };
        }

        case 'listAdmins': {
          const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
          return { code: 0, data: { openids: (row?.value as { openids?: string[] } | undefined)?.openids ?? [] } };
        }

        case 'listOrders': {
          const input = ListOrdersSchema.parse(payload ?? {});
          const where = {
            ...(input.status ? { status: input.status } : {}),
          };
          const [list, total] = await Promise.all([
            prisma.order.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: (input.page - 1) * input.pageSize,
              take: input.pageSize,
              include: {
                items: true,
                user: { select: { id: true, nickname: true, phone: true } },
              },
            }),
            prisma.order.count({ where }),
          ]);
          return {
            code: 0,
            data: {
              list: list.map((o) => ({
                ...o,
                totalAmount: o.totalAmount.toString(),
                payAmount: o.payAmount.toString(),
                createdAt: o.createdAt.toISOString(),
                updatedAt: o.updatedAt.toISOString(),
              })),
              total,
              page: input.page,
              pageSize: input.pageSize,
            },
          };
        }

        case 'updateOrderStatus': {
          const input = UpdateOrderStatusSchema.parse(payload);
          const order = await prisma.order.findUnique({ where: { id: input.orderId } });
          if (!order) throw Errors.notFound('订单不存在');
          // 走状态机白名单：禁止裸跳（如直接置 refunded/paid 而不触发钱包/退款副作用）。
          // 涉及退款的目标态必须走 refundOrder action，不允许在此裸改。
          assertTransition(order.status as OrderStatus, input.status as OrderStatus);
          const updated = await prisma.order.update({
            where: { id: input.orderId },
            data: { status: input.status },
          });
          return {
            code: 0,
            data: {
              id: updated.id,
              status: updated.status,
              updatedAt: updated.updatedAt.toISOString(),
            },
          };
        }

        case 'refundOrder': {
          const input = RefundOrderSchema.parse(payload);
          const result = await refundService.refundOrder({
            orderId: input.orderId,
            amountFen: input.amountFen,
            reason: input.reason,
            refundedBy: req.user.openid,
          });
          return { code: 0, data: result };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
