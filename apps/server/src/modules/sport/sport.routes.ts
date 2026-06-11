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
  SportActionBodySchema,
} from './sport.schema.js';

export async function sportRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: { body: SportActionBodySchema },
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
          const input = CheckinInputSchema.parse(payload);
          return { code: 0, data: await sportService.checkin(userId, input) };
        }
        case 'myStats': {
          const input = MyStatsInputSchema.parse(payload ?? {});
          return { code: 0, data: await sportService.myStats(userId, input) };
        }
        case 'myGroups': {
          return { code: 0, data: { groups: await sportService.myGroups(userId) } };
        }
        case 'createGroup': {
          const input = CreateGroupInputSchema.parse(payload);
          const user = await userRepo.findById(userId);
          if (!user) throw Errors.notFound('user not found');
          const group = await sportService.createGroup(userId, input, user.nickname ?? '匿名');
          return { code: 0, data: { group } };
        }
        case 'joinGroup': {
          const input = JoinGroupInputSchema.parse(payload);
          const user = await userRepo.findById(userId);
          if (!user) throw Errors.notFound('user not found');
          return { code: 0, data: await sportService.joinGroup(userId, input, user.nickname ?? '匿名', user.avatarUrl) };
        }
        case 'quitGroup': {
          const input = QuitGroupInputSchema.parse(payload);
          return { code: 0, data: await sportService.quitGroup(userId, input) };
        }
        case 'groupRanking': {
          const input = GroupRankingInputSchema.parse(payload);
          return { code: 0, data: await sportService.groupRanking(userId, input) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
