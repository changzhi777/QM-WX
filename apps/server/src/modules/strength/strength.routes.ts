/**
 * strength module routes — V0.2.42 力量训练记录（训记式 + V0.2.126 动作统计 + V0.2.132 自定义动作）
 *
 * POST /api/strength { action, payload }（JWT）
 *   - startSession     开始训练（创建空 session + 自动计时由前端管）
 *   - addSet           记录一组（动作/次数/重量/组序，实时累加 volume）
 *   - finishSession    完成训练（设时长/备注）
 *   - listSessions     训练历史（分页）
 *   - sessionDetail    单次训练详情（所有组）
 *   - myVolume         容量统计（最近 N 天趋势）
 *   - listExercises    动作库（预设 + 当前用户自定义，category/search 过滤）— V0.2.132 合并
 *   - getExerciseStats 动作统计（PB + 容量分布）— V0.2.126
 *   - addUserExercise  新增自定义动作 — V0.2.132
 *   - listUserExercises 列出我的自定义动作 — V0.2.132
 *   - removeUserExercise 删除我的自定义动作 — V0.2.132
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
  AddUserExerciseSchema,
  RemoveUserExerciseSchema,
  ToggleFavoriteExerciseSchema,
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
        return { code: 0, data: await strengthService.listExercises(userId, ListExercisesSchema.parse(payload ?? {})) };
      case 'getExerciseStats':
        GetExerciseStatsSchema.parse(payload ?? {});
        return { code: 0, data: await strengthService.getExerciseStats(userId) };
      case 'addUserExercise': {
        const input = AddUserExerciseSchema.parse(payload);
        return { code: 0, data: await strengthService.addUserExercise(userId, input) };
      }
      case 'listUserExercises':
        return { code: 0, data: await strengthService.listUserExercises(userId) };
      case 'removeUserExercise': {
        const { id } = RemoveUserExerciseSchema.parse(payload);
        return { code: 0, data: await strengthService.removeUserExercise(userId, id) };
      }
      case 'toggleFavoriteExercise': {
        // V0.2.134 切换收藏（1 端点覆盖 add/remove；toggle 模型 UX 友好）
        const { exerciseId } = ToggleFavoriteExerciseSchema.parse(payload);
        return { code: 0, data: await strengthService.toggleFavoriteExercise(userId, exerciseId) };
      }
      case 'listFavoriteExercises':
        // V0.2.134 列出我的收藏动作
        return { code: 0, data: await strengthService.listFavoriteExercises(userId) };
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
