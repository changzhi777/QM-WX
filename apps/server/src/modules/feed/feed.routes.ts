/**
 * feed module routes — POST /api/feed（V0.1.30，社交向）
 *
 * 动态流：list / myFeeds / publish / like / unlike / comment
 */
import type { FastifyInstance } from 'fastify';
import { feedService } from './feed.service.js';
import { Errors } from '../../common/errors.js';
import {
  PublishFeedInputSchema,
  FeedPageSchema,
  CommentInputSchema,
  FeedIdInputSchema,
} from './feed.schema.js';

export async function feedRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list': {
        const input = FeedPageSchema.parse(payload ?? {});
        return { code: 0, data: await feedService.list(userId, input) };
      }
      case 'hotTopics': {
        return { code: 0, data: await feedService.hotTopics() };
      }
      case 'myFeeds': {
        const { page, pageSize } = FeedPageSchema.parse(payload ?? {});
        return { code: 0, data: await feedService.myFeeds(userId, page, pageSize) };
      }
      case 'publish': {
        const input = PublishFeedInputSchema.parse(payload);
        return { code: 0, data: await feedService.publish(userId, input) };
      }
      case 'like': {
        const { feedId } = FeedIdInputSchema.parse(payload);
        return { code: 0, data: await feedService.like(userId, feedId) };
      }
      case 'unlike': {
        const { feedId } = FeedIdInputSchema.parse(payload);
        return { code: 0, data: await feedService.unlike(userId, feedId) };
      }
      case 'comment': {
        const input = CommentInputSchema.parse(payload);
        return { code: 0, data: await feedService.comment(userId, input.feedId, input.content) };
      }
      // V0.1.136 跑鞋 picker
      case 'shoesForPicker':
        return { code: 0, data: await feedService.shoesForPicker(userId) };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
