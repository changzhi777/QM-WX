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
import { prisma } from '../../infra/prisma.js';
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
  ListInterpretSchema,
  BanUserSchema,
  UnbanUserSchema,
  ListAuditLogsSchema,
  StatsByTimeRangeSchema,
  ExportOrdersSchema,
  ExportUsersSchema,
  UpsertGroupBuySchema,
  ListGroupBuysSchema,
  UpsertTrainingPlanSchema,
  ListTrainingPlansSchema,
  ListUploadsSchema,
  AdjustPointsSchema,
  GrantMemberSchema,
  ListInviteStatsSchema,
  CreateAdminSchema,
  UpdateAdminSchema,
  ListAdminLoginLogsSchema,
  RetryParseSchema,
  ListWithdrawalsSchema,
  WithdrawalIdSchema,
  RejectWithdrawalSchema,
  ConfirmPickupSchema,
  ExportSettlementQuerySchema,
  AddReviewReplySchema,
  AdminSubmitRaceResultSchema,
  AdminListEnrollmentsByContentSchema,
  ListReviewsSchema,
} from './admin.schema.js';

export async function adminRoutes(app: FastifyInstance) {
  // 应用 featureGatePlugin（auth 已挂）
  await app.register(featureGatePlugin);

  // V0.2.8 admin 登录（public，/api/admin/login，替白名单 openid 体系）
  app.post('/login', { config: { public: true } }, async (req) => {
    const { username, password } = req.body as { username: string; password: string };
    return {
      code: 0,
      data: await adminService.adminLogin(app, username, password, {
        ip: req.ip,
        ua: req.headers['user-agent'],
      }),
    };
  });

  app.post('/', async (req, reply) => {
    // V0.2.8 admin 鉴权（替 isAdmin openid）：admin JWT（kind:admin）+ Admin 表 + RBAC
    const u = req.user as { kind?: string; sub?: string } | undefined;
    if (!u || u.kind !== 'admin') throw Errors.unauthorized();
    const admin = await prisma.admin.findUnique({
      where: { id: u.sub! },
      select: { id: true, username: true, role: true, disabled: true },
    });
    if (!admin || admin.disabled) throw Errors.unauthorized();

    const { action, payload } = req.body as { action: string; payload?: unknown };
    if (!adminService.checkPermission(admin.role, action)) {
      return reply.status(403).send({ code: 403, msg: '权限不足' });
    }
    const actorOpenid = admin.username; // 审计用 username（替 openid）
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
      // ===== 团购管理（V0.1.37 新增）=====
      case 'upsertGroupBuy':
        return { code: 0, data: await adminService.upsertGroupBuy(UpsertGroupBuySchema.parse(payload)) };
      case 'listGroupBuys':
        return { code: 0, data: await adminService.listGroupBuys(ListGroupBuysSchema.parse(payload ?? {})) };
      // ===== 训练计划管理（V0.1.41 新增）=====
      case 'upsertTrainingPlan':
        return { code: 0, data: await adminService.upsertTrainingPlan(UpsertTrainingPlanSchema.parse(payload)) };
      case 'listTrainingPlans':
        return { code: 0, data: await adminService.listTrainingPlans(ListTrainingPlansSchema.parse(payload ?? {})) };
      case 'stats':
        return { code: 0, data: await adminService.stats() };
      // ===== 上传记录管理（V0.1.150 COS 中转解析）=====
      case 'listUploads':
        return { code: 0, data: await adminService.listUploads(ListUploadsSchema.parse(payload ?? {})) };
      case 'listInterpret':
        return { code: 0, data: await adminService.listInterpret(ListInterpretSchema.parse(payload ?? {})) };
      case 'retryParse':
        return { code: 0, data: await adminService.retryParse(RetryParseSchema.parse(payload)) };
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
      // ===== V0.1.105 GAP-6 提现审核 =====
      case 'listWithdrawals':
        return {
          code: 0,
          data: await adminService.listWithdrawals(ListWithdrawalsSchema.parse(payload ?? {})),
        };
      case 'approveWithdrawal':
        return {
          code: 0,
          data: await adminService.approveWithdrawal(
            WithdrawalIdSchema.parse(payload).id,
            actorOpenid,
          ),
        };
      case 'rejectWithdrawal':
        return {
          code: 0,
          data: await adminService.rejectWithdrawal(
            RejectWithdrawalSchema.parse(payload).id,
            RejectWithdrawalSchema.parse(payload).reason,
            actorOpenid,
          ),
        };
      // ===== V0.1.107 GAP-6 自提核销 =====
      case 'confirmPickup':
        return {
          code: 0,
          data: await adminService.confirmPickup(
            ConfirmPickupSchema.parse(payload).pickupCode,
            actorOpenid,
          ),
        };
      // ===== V0.1.108 GAP-6 结算单导出 =====
      case 'exportSettlement': {
        const csv = await adminService.exportSettlement(
          ExportSettlementQuerySchema.parse(payload ?? {}),
          actorOpenid,
        );
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="settlement-${Date.now()}.csv"`);
        return reply.send(csv);
      }
      // ===== V0.1.116 评价 =====
      case 'listReviews': {
        return { code: 0, data: await adminService.listReviews(ListReviewsSchema.parse(payload ?? {})) };
      }
      case 'addReviewReply': {
        const input = AddReviewReplySchema.parse(payload);
        return { code: 0, data: await adminService.addReviewReply(input) };
      }
      // V0.1.134 赛事成绩 admin 录入
      case 'submitRaceResult': {
        const input = AdminSubmitRaceResultSchema.parse(payload);
        return {
          code: 0,
          data: await adminService.submitRaceResult(actorOpenid, input, ip),
        };
      }
      case 'listEnrollmentsByContent': {
        const input = AdminListEnrollmentsByContentSchema.parse(payload);
        return {
          code: 0,
          data: await adminService.listEnrollmentsByContent(actorOpenid, input.contentId),
        };
      }
      // ===== V0.2.6 邀请裂变 admin（手动调积分 / 送会员 / 邀请榜）=====
      case 'adjustPoints':
        return {
          code: 0,
          data: await adminService.adjustPoints(AdjustPointsSchema.parse(payload), actorOpenid, ip),
        };
      case 'grantMember':
        return {
          code: 0,
          data: await adminService.grantMember(GrantMemberSchema.parse(payload), actorOpenid, ip),
        };
      case 'listInviteStats':
        return {
          code: 0,
          data: await adminService.listInviteStats(ListInviteStatsSchema.parse(payload ?? {})),
        };
      // V0.2.8 admin 账号管理（super-admin only，RBAC 守卫）
      case 'createAdmin':
        return { code: 0, data: await adminService.createAdmin(CreateAdminSchema.parse(payload)) };
      case 'updateAdmin':
        return { code: 0, data: await adminService.updateAdmin(UpdateAdminSchema.parse(payload)) };
      case 'adminLoginLogs':
        return {
          code: 0,
          data: await adminService.adminLoginLogs(ListAdminLoginLogsSchema.parse(payload ?? {})),
        };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}