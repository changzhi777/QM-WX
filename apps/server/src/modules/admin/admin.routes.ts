/**
 * admin module routes — 内容 / 商品 / 订单 / 配置 / 用户 / 统计 / 黑名单 / 审计 / 导出
 *
 * POST /api/admin  body = { action, payload }
 * 鉴权：openid 必须在 AppConfig.admin_whitelist（adminService.isAdmin，内存缓存 60s TTL）
 *
 * Action（14，V0.1.18 +3 / V0.1.19 +3）：
 * - upsertContent / upsertProduct   { ... }（id 可选，有则 update）
 * - setConfig                       { id, value }
 * - listAdmins                      {}
 * - listOrders / updateOrderStatus / refundOrder   订单三件套
 * - listUsers / listContents / listProducts / stats   管理 list/概览（P1-2 新增）
 * - banUser / unbanUser / listAuditLogs               黑名单+审计（V0.1.18 新增）
 * - statsByTimeRange / exportOrders / exportUsers     报表+导出（V0.1.19 新增）
 */
import type { FastifyInstance } from 'fastify';
import { featureGatePlugin } from '../../common/middleware/feature-gate.js';
import { Errors } from '../../common/errors.js';
import * as adminService from './admin.service.js';
import {
  UpsertContentSchema,
  UpsertProductSchema,
  SetConfigSchema,
  ListOrdersSchema,
  UpdateOrderStatusSchema,
  RefundOrderSchema,
  ListUsersSchema,
  ListContentsSchema,
  ListProductsSchema,
  BanUserSchema,
  UnbanUserSchema,
  ListAuditLogsSchema,
  StatsByTimeRangeSchema,
  ExportOrdersSchema,
  ExportUsersSchema,
} from './admin.schema.js';

export async function adminRoutes(app: FastifyInstance) {
  // 应用 featureGatePlugin（auth 已挂）
  await app.register(featureGatePlugin);

  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    if (!(await adminService.isAdmin(req.user.openid))) {
      return reply.status(403).send({ code: 403, msg: 'admin only' });
    }

    const { action, payload } = req.body as { action: string; payload?: unknown };
    const actorOpenid = req.user.openid;
    const ip = req.ip;

    switch (action) {
      case 'upsertContent':
        return { code: 0, data: await adminService.upsertContent(UpsertContentSchema.parse(payload)) };
      case 'upsertProduct':
        return { code: 0, data: await adminService.upsertProduct(UpsertProductSchema.parse(payload)) };
      case 'setConfig':
        return { code: 0, data: await adminService.setConfig(SetConfigSchema.parse(payload), actorOpenid, ip) };
      case 'listAdmins':
        return { code: 0, data: await adminService.listAdmins() };
      case 'listOrders':
        return { code: 0, data: await adminService.listOrders(ListOrdersSchema.parse(payload ?? {})) };
      case 'updateOrderStatus':
        return { code: 0, data: await adminService.updateOrderStatus(UpdateOrderStatusSchema.parse(payload)) };
      case 'refundOrder':
        return {
          code: 0,
          data: await adminService.refundOrder(RefundOrderSchema.parse(payload), actorOpenid, ip),
        };
      // ===== 管理 list / 概览（P1-2 新增）=====
      case 'listUsers':
        return { code: 0, data: await adminService.listUsers(ListUsersSchema.parse(payload ?? {})) };
      case 'listContents':
        return { code: 0, data: await adminService.listContents(ListContentsSchema.parse(payload ?? {})) };
      case 'listProducts':
        return { code: 0, data: await adminService.listProducts(ListProductsSchema.parse(payload ?? {})) };
      case 'stats':
        return { code: 0, data: await adminService.stats() };
      // ===== 黑名单 + 审计（V0.1.18 新增）=====
      case 'banUser':
        return {
          code: 0,
          data: await adminService.banUser(BanUserSchema.parse(payload), actorOpenid, ip),
        };
      case 'unbanUser':
        return {
          code: 0,
          data: await adminService.unbanUser(UnbanUserSchema.parse(payload), actorOpenid, ip),
        };
      case 'listAuditLogs':
        return { code: 0, data: await adminService.listAuditLogs(ListAuditLogsSchema.parse(payload ?? {})) };
      // ===== 报表 + 导出（V0.1.19 新增）=====
      case 'statsByTimeRange':
        return {
          code: 0,
          data: await adminService.statsByTimeRange(StatsByTimeRangeSchema.parse(payload ?? {})),
        };
      case 'exportOrders': {
        const csv = await adminService.exportOrders(ExportOrdersSchema.parse(payload ?? {}));
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="orders.csv"');
        return reply.send(csv);
      }
      case 'exportUsers': {
        const csv = await adminService.exportUsers(ExportUsersSchema.parse(payload ?? {}));
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="users.csv"');
        return reply.send(csv);
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}