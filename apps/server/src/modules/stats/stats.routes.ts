/**
 * stats module routes — POST /api/stats
 *
 * 跑者数据汇总（读模型）。复用 sport 的 action/payload 路由范式。
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { statsService } from './stats.service.js';
import { Errors } from '../../common/errors.js';
import { MyRunnerStatsQuerySchema, MyAnnualReportQuerySchema, HealthScoreQuerySchema, DailyReportQuerySchema, DailyReportListQuerySchema } from './stats.schema.js';

/** 统一把 Zod 错误转 BusinessError（与 sport.routes 一致） */
function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  try {
    return schema.parse(payload) as z.output<S>;
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      throw Errors.badRequest(`${first.path.join('.')}: ${first.message}`);
    }
    throw e;
  }
}

export async function statsRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'myRunnerStats': {
        const input = parseOrBadRequest(MyRunnerStatsQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.myRunnerStats(userId, input) };
      }
      case 'myAnnualReport': {
        const input = parseOrBadRequest(MyAnnualReportQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.myAnnualReport(userId, input) };
      }
      case 'myCertificates': {
        return { code: 0, data: await statsService.myCertificates(userId) };
      }
      case 'healthScore': {
        const input = parseOrBadRequest(HealthScoreQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.healthScore(userId, input) };
      }
      case 'dailyReport': {
        const input = parseOrBadRequest(DailyReportQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.dailyReport(userId, input) };
      }
      case 'dailyReportList': {
        const input = parseOrBadRequest(DailyReportListQuerySchema, payload ?? {});
        return { code: 0, data: await statsService.dailyReportList(userId, input) };
      }
      case 'weather': {
        const input = (payload ?? {}) as { lat?: number; lon?: number };
        return { code: 0, data: await statsService.weather(userId, input) };
      }
      case 'weatherAir': {
        const input = (payload ?? {}) as { lat?: number; lon?: number };
        return { code: 0, data: await statsService.weatherAir(userId, input) };
      }
      case 'weatherAnalysis': {
        return { code: 0, data: await statsService.weatherAnalysis(userId) };
      }
      case 'userProfile': {
        return { code: 0, data: await statsService.userProfile(userId) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
