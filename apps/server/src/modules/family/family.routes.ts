/**
 * family module routes — POST /api/family（V0.1.34，pic 2776 家庭方向）
 *
 * 家庭空间：createFamily / joinFamily / myFamily / leaveFamily / familyRanking / inviteInfo
 */
import type { FastifyInstance } from 'fastify';
import { familyService } from './family.service.js';
import { Errors } from '../../common/errors.js';
import {
  CreateFamilySchema,
  JoinFamilySchema,
  FamilyRankingSchema,
  TransferOwnerSchema,
} from './family.schema.js';

export async function familyRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'createFamily': {
        const input = CreateFamilySchema.parse(payload);
        return { code: 0, data: await familyService.createFamily(userId, input) };
      }
      case 'joinFamily': {
        const input = JoinFamilySchema.parse(payload);
        return { code: 0, data: await familyService.joinFamily(userId, input) };
      }
      case 'myFamily':
        return { code: 0, data: await familyService.myFamily(userId) };
      case 'leaveFamily':
        return { code: 0, data: await familyService.leaveFamily(userId) };
      case 'familyRanking': {
        const input = FamilyRankingSchema.parse(payload ?? {});
        return { code: 0, data: await familyService.familyRanking(userId, input) };
      }
      case 'inviteInfo':
        return { code: 0, data: await familyService.inviteInfo(userId) };
      case 'transferOwner': {
        const input = TransferOwnerSchema.parse(payload);
        return { code: 0, data: await familyService.transferOwner(userId, input) };
      }
      case 'dissolveFamily':
        return { code: 0, data: await familyService.dissolveFamily(userId) };
      case 'familyAchievements':
        return { code: 0, data: await familyService.familyAchievements(userId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
