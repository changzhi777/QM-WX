/**
 * strength module routes — V0.2.42 力量训练记录（训记式 + V0.2.126 动作统计）
 *
 * POST /api/strength { action, payload }（JWT）
 *   - startSession     开始训练（创建空 session + 自动计时由前端管）
 *   - addSet           记录一组（动作/次数/重量/组序，实时累加 volume）
 *   - finishSession    完成训练（设时长/备注）
 *   - listSessions     训练历史（分页）
 *   - sessionDetail    单次训练详情（所有组）
 *   - myVolume         容量统计（最近 N 天趋势）
 *   - listExercises    动作库（预设 + 自定义，category/search 过滤）
 *   - getExerciseStats 动作统计（PB + 容量分布）— V0.2.126
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import * as strengthService from './strength.service.js';
import {
  AddSetSchema,
  FinishSessionSchema,
  SessionDetailSchema,
  ListSessionsSchema,
  MyVolumeSchema,
  ListExercisesSchema,
  GetExerciseStatsSchema,
} from './strength.schema.js';

export async function strengthRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as { action: string; payload?: Record<string, unknown> };
    const userId = req.user.id;

    switch (action) {
      case 'startSession':
        return { code: 0, data: await strengthService.startSession(userId) };
      case 'addSet':
        return { code: 0, data: await strengthService.addSet(userId, AddSetSchema.parse(payload)) };
      case 'finishSession':
        return { code: 0, data: await strengthService.finishSession(userId, FinishSessionSchema.parse(payload)) };
      case 'listSessions':
        return { code: 0, data: await strengthService.listSessions(userId, ListSessionsSchema.parse(payload ?? {})) };
      case 'sessionDetail': {
        const { sessionId } = SessionDetailSchema.parse(payload);
        return { code: 0, data: await strengthService.sessionDetail(userId, sessionId) };
      }
      case 'myVolume':
        return { code: 0, data: await strengthService.myVolume(userId, MyVolumeSchema.parse(payload ?? {})) };
      case 'listExercises':
        return { code: 0, data: await strengthService.listExercises(ListExercisesSchema.parse(payload ?? {})) };
      case 'getExerciseStats':
        // V0.2.126 无入参，body 任意 JSON 均通过
        GetExerciseStatsSchema.parse(payload ?? {});
        return { code: 0, data: await strengthService.getExerciseStats(userId) };
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
