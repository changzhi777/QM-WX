/**
 * training module routes — POST /api/training（V0.1.25，参考图 2775）
 *
 * 锻炼/训练中心：训练计划 + 跑步记录
 */
import type { FastifyInstance } from 'fastify';
import { trainingService } from './training.service.js';
import { Errors } from '../../common/errors.js';
import { MyPlansQuerySchema, MySportRecordsQuerySchema, JoinPlanSchema } from './training.schema.js';

export async function trainingRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'myPlans': {
        MyPlansQuerySchema.parse(payload ?? {});
        return { code: 0, data: await trainingService.myPlans() };
      }
      case 'mySportRecords': {
        const input = MySportRecordsQuerySchema.parse(payload ?? {});
        return { code: 0, data: await trainingService.mySportRecords(userId, input) };
      }
      // ===== 训练计划加入 / 进度 / 离开（V0.1.41 新增）=====
      case 'joinPlan': {
        const input = JoinPlanSchema.parse(payload ?? {});
        return { code: 0, data: await trainingService.joinPlan(userId, input) };
      }
      case 'myActivePlan': {
        return { code: 0, data: await trainingService.myActivePlan(userId) };
      }
      case 'leavePlan': {
        return { code: 0, data: await trainingService.leavePlan(userId) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
