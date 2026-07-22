/**
 * Terra webhook：聚合平台数据推送接收（阶段 3.3）
 *
 * POST /api/device/terra-webhook（public，Terra 推送无 JWT）
 * - 签名校验（TERRA_WEBHOOK_SECRET 非空时校 terra-signature header；空则 dev/mock 模式跳过）
 * - type=activity：标准化 → 找 DeviceBinding（vendor=terra, vendorUserId）→ sportService.checkin 幂等去重
 * - daily/sleep/body/menstruation：留后续（HealthRecord 落库，V0.1.43 范式）
 *
 * 签约前 secret='' 跳过签名（payload simulator / curl mock 测试）。
 * 签约后：env 注入 TERRA_WEBHOOK_SECRET + Terra dashboard 配 webhook URL。
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import { env } from '../../config/env.js';
import { sportService } from '../sport/sport.service.js';
import { terraActivityToCheckin, type TerraPayload } from './terra.parser.js';

export async function terraWebhookRoutes(app: FastifyInstance) {
  app.post(
    '/terra-webhook',
    { config: { public: true } },
    async (req) => {
      // 签名校验（secret 非空才校；dev/mock 空 secret 跳过）
      const secret = env.TERRA_WEBHOOK_SECRET;
      if (secret) {
        const sig = req.headers['terra-signature'] as string | undefined;
        if (sig !== secret) throw Errors.unauthorized('terra signature invalid');
      }

      const payload = req.body as TerraPayload;
      if (!payload?.type || !Array.isArray(payload.data)) {
        return { code: 0, data: { skipped: 'invalid payload' } };
      }

      const terraUserId = payload.user?.user_id ?? payload.user?.reference_id;
      if (!terraUserId) return { code: 0, data: { skipped: 'no user' } };

      // 找绑定（vendor=terra, vendorUserId=terra_user_id, active）
      const binding = await prisma.deviceBinding.findFirst({
        where: { vendor: 'terra', vendorUserId: terraUserId, status: 'active' },
      });
      if (!binding) {
        return { code: 0, data: { skipped: 'no binding', terraUserId } };
      }

      let processed = 0;
      let deduped = 0;
      let skipped = 0;

      if (payload.type === 'activity') {
        for (const entry of payload.data) {
          const c = terraActivityToCheckin(entry);
          if (!c) {
            skipped++;
            continue;
          }
          // 幂等去重（V0.2.60 范式：userId + date + distance + dataSource）
          const dup = await prisma.checkin.findFirst({
            where: {
              userId: binding.userId,
              date: c.date,
              distance: c.distance,
              dataSource: c.dataSource,
            },
          });
          if (dup) {
            deduped++;
            continue;
          }
          try {
            await sportService.checkin(binding.userId, {
              distance: c.distance,
              durationSec: c.durationSec,
              date: c.date,
              heartRate: c.heartRate,
              dataSource: c.dataSource,
              sportType: c.sportType,
            } as never);
            processed++;
          } catch {
            skipped++;
          }
        }
      }
      // daily/sleep/body 留后续（V0.1.43 HealthRecord 落库）

      return {
        code: 0,
        data: { type: payload.type, userId: binding.userId, processed, deduped, skipped },
      };
    },
  );
}
