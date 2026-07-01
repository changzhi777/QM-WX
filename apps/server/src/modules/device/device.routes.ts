/**
 * device module routes — POST /api/device
 *
 * Phase 6 实现。当前全 stub。
 */
import type { FastifyInstance } from 'fastify';
import { deviceService } from './device.service.js';
import { Errors } from '../../common/errors.js';
import {
  ListBindingsInputSchema,
  StartOAuthInputSchema,
  SyncWeRunInputSchema,
  UnbindInputSchema,
  MyActivitiesQuerySchema,
  MySleepQuerySchema,
  MyMetricsQuerySchema,
  MyFitnessAgeQuerySchema,
  ActivityPageQuerySchema,
  IgnoreActivityInputSchema,
  ImportToCheckinInputSchema,
} from './device.schema.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.post(
    '/',
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const userId = req.user.id;
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listBindings': {
          ListBindingsInputSchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.listBindings(userId) };
        }
        case 'startOAuth': {
          const input = StartOAuthInputSchema.parse(payload);
          return { code: 0, data: await deviceService.startOAuth(userId, input) };
        }
        case 'unbind': {
          const input = UnbindInputSchema.parse(payload);
          return { code: 0, data: await deviceService.unbind(userId, input.vendor) };
        }
        case 'syncWeRun': {
          const input = SyncWeRunInputSchema.parse(payload);
          return { code: 0, data: await deviceService.syncWeRun(userId, input) };
        }
        case 'submitHeartRate': {
          return { code: 0, data: await deviceService.submitHeartRate(userId, payload) };
        }
        // 佳明数据查询（B-2，2026-07-01）
        case 'myActivities': {
          const input = MyActivitiesQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myActivities(userId, input) };
        }
        case 'mySleep': {
          const input = MySleepQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.mySleep(userId, input) };
        }
        case 'myMetrics': {
          const input = MyMetricsQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myMetrics(userId, input) };
        }
        case 'myFitnessAge': {
          const input = MyFitnessAgeQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myFitnessAge(userId, input) };
        }
        case 'myPending': {
          const input = ActivityPageQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myPending(userId, input) };
        }
        case 'myProcessed': {
          const input = ActivityPageQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myProcessed(userId, input) };
        }
        case 'ignoreActivity': {
          const input = IgnoreActivityInputSchema.parse(payload);
          return { code: 0, data: await deviceService.ignoreActivity(userId, input) };
        }
        case 'importToCheckin': {
          const input = ImportToCheckinInputSchema.parse(payload);
          return { code: 0, data: await deviceService.importToCheckin(userId, input) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
