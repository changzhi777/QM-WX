/**
 * admin module — 内容 / 商品 / 配置管理
 *
 * POST /api/admin
 * 鉴权：openid 必须出现在 AppConfig.admin_whitelist
 *
 * Action:
 * - upsertContent  { id?, type, title, ... }
 * - upsertProduct  { id?, name, category, price, ... }
 * - setConfig      { id: 'feature_flags' | 'member_levels' | 'points_rules', value }
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { featureGatePlugin } from '../../common/middleware/feature-gate.js';
import { CONTENT_TYPES } from '../content/content.schema.js';

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

const AdminActionBodySchema = z.object({
  action: z.enum(['upsertContent', 'upsertProduct', 'setConfig', 'listAdmins']),
  payload: z.unknown().optional(),
});

async function isAdmin(openid: string): Promise<boolean> {
  const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
  const list = (row?.value as { openids?: string[] } | undefined)?.openids ?? [];
  return list.includes(openid);
}

export async function adminRoutes(app: FastifyInstance) {
  // 应用 featureGatePlugin（auth 已挂）
  await app.register(featureGatePlugin);

  app.post(
    '/',
    { schema: { body: AdminActionBodySchema } },
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
          return { code: 0, data: { id: product.id } };
        }

        case 'setConfig': {
          const input = SetConfigSchema.parse(payload);
          await prisma.appConfig.upsert({
            where: { id: input.id },
            create: { id: input.id, value: input.value },
            update: { value: input.value },
          });
          // ⚠️ featureGate 中间件有内存缓存；Phase 1.1 加 cache invalidation
          return { code: 0, data: { ok: true, note: '需要重启服务生效' } };
        }

        case 'listAdmins': {
          const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
          return { code: 0, data: { openids: (row?.value as { openids?: string[] } | undefined)?.openids ?? [] } };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
