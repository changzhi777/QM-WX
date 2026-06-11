/**
 * sport module routes — POST /api/sport
 */
import type { FastifyInstance } from 'fastify';
import { sportService } from './sport.service.js';
import { userRepo } from '../user/user.repository.js';
import { Errors } from '../../common/errors.js';
import {
  CheckinInputSchema,
  CreateGroupInputSchema,
  GroupRankingInputSchema,
  JoinGroupInputSchema,
  MyStatsInputSchema,
  QuitGroupInputSchema,
} from './sport.schema.js';
import { z } from 'zod';

/** 统一把 Zod 错误转 BusinessError（fastify 4 在 e2e/inject 模式下不总是走 setErrorHandler） */
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

export async function sportRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
    },
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const userId = req.user.id;
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'today': {
          return { code: 0, data: await sportService.today(userId) };
        }
        case 'checkin': {
          const input = parseOrBadRequest(CheckinInputSchema, payload);
          return { code: 0, data: await sportService.checkin(userId, input) };
        }
        case 'myStats': {
          const input = parseOrBadRequest(MyStatsInputSchema, payload ?? {});
          return { code: 0, data: await sportService.myStats(userId, input) };
        }
        case 'myGroups': {
          return { code: 0, data: { groups: await sportService.myGroups(userId) } };
        }
        case 'createGroup': {
          const input = parseOrBadRequest(CreateGroupInputSchema, payload);
          const user = await userRepo.findById(userId);
          if (!user) throw Errors.notFound('user not found');
          const group = await sportService.createGroup(userId, input, user.nickname ?? '匿名');
          return { code: 0, data: { group } };
        }
        case 'joinGroup': {
          const input = parseOrBadRequest(JoinGroupInputSchema, payload);
          const user = await userRepo.findById(userId);
          if (!user) throw Errors.notFound('user not found');
          return { code: 0, data: await sportService.joinGroup(userId, input, user.nickname ?? '匿名', user.avatarUrl) };
        }
        case 'quitGroup': {
          const input = parseOrBadRequest(QuitGroupInputSchema, payload);
          return { code: 0, data: await sportService.quitGroup(userId, input) };
        }
        case 'groupRanking': {
          const input = parseOrBadRequest(GroupRankingInputSchema, payload);
          return { code: 0, data: await sportService.groupRanking(userId, input) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
