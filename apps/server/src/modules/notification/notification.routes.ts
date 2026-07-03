/**
 * notification module routes — POST /api/notification（V0.1.31，社交向）
 *
 * 消息中心：list（分页含 actor）/ unreadCount / markRead / markAllRead
 */
import type { FastifyInstance } from 'fastify';
import { notificationService } from './notification.service.js';
import { Errors } from '../../common/errors.js';
import { NotifPageSchema, NotifIdInputSchema } from './notification.schema.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list': {
        const input = NotifPageSchema.parse(payload ?? {});
        return { code: 0, data: await notificationService.list(userId, input) };
      }
      case 'unreadCount': {
        return { code: 0, data: await notificationService.unreadCount(userId) };
      }
      case 'markRead': {
        const input = NotifIdInputSchema.parse(payload);
        return { code: 0, data: await notificationService.markRead(userId, input) };
      }
      case 'markAllRead': {
        return { code: 0, data: await notificationService.markAllRead(userId) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
