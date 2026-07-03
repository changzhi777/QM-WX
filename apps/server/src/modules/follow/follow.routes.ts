/**
 * follow module routes — POST /api/follow（V0.1.32，社交向深化）
 *
 * 关注/粉丝：follow / unfollow / isFollowing / myFollowing / myFollowers / myCounts
 */
import type { FastifyInstance } from 'fastify';
import { followService } from './follow.service.js';
import { Errors } from '../../common/errors.js';
import {
  UserIdInputSchema,
  FollowPageSchema,
  IsFollowingInputSchema,
} from './follow.schema.js';

export async function followRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const meId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'follow': {
        const input = UserIdInputSchema.parse(payload);
        return { code: 0, data: await followService.follow(meId, input) };
      }
      case 'unfollow': {
        const input = UserIdInputSchema.parse(payload);
        return { code: 0, data: await followService.unfollow(meId, input) };
      }
      case 'isFollowing': {
        const input = IsFollowingInputSchema.parse(payload);
        return { code: 0, data: await followService.isFollowing(meId, input) };
      }
      case 'myFollowing': {
        const input = FollowPageSchema.parse(payload ?? {});
        return { code: 0, data: await followService.myFollowing(meId, input) };
      }
      case 'myFollowers': {
        const input = FollowPageSchema.parse(payload ?? {});
        return { code: 0, data: await followService.myFollowers(meId, input) };
      }
      case 'myCounts': {
        // 可查任意 userId（用户主页用）；viewerId 是当前登录者
        const { userId } = UserIdInputSchema.parse(payload);
        return { code: 0, data: await followService.myCounts(userId, meId) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
