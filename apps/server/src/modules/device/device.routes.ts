/**
 * device module routes — POST /api/device
 *
 * Phase 6 实现。当前全 stub。
 */
import type { FastifyInstance } from 'fastify';
import { deviceService } from './device.service.js';
import { Errors } from '../../common/errors.js';
import {
  DeviceActionBodySchema,
  ListBindingsInputSchema,
  StartOAuthInputSchema,
  SyncWeRunInputSchema,
  UnbindInputSchema,
} from './device.schema.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { schema: { body: DeviceActionBodySchema } },
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
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
