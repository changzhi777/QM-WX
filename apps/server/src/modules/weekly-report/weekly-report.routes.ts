/**
 * weekly-report routes — POST /api/weekly-report
 */
import type { FastifyInstance } from 'fastify';
import { weeklyReportService } from './weekly-report.service.js';
import { Errors } from '../../common/errors.js';

export async function weeklyReportRoutes(app: FastifyInstance) {
  app.post(
    '/',
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const { action, payload } = req.body as { action: string; payload?: { groupId?: string; period?: string } };

      switch (action) {
        case 'currentWeek': {
          const reports = await weeklyReportService.currentWeek(req.user.id, payload?.groupId);
          return { code: 0, data: { reports } };
        }
        case 'myReport': {
          const reports = await weeklyReportService.myReport(req.user.id, payload?.groupId);
          return { code: 0, data: reports };
        }
        case 'trigger': {
          if (!payload?.groupId) {
            return reply.status(400).send({ code: 400, msg: 'groupId required' });
          }
          const result = await weeklyReportService.trigger(req.user.id, payload.groupId, payload.period);
          return { code: 0, data: result };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
