/**
 * content module routes — POST /api/content
 */
import type { FastifyInstance } from 'fastify';
import { contentService } from './content.service.js';
import { Errors } from '../../common/errors.js';
import {
  ContentListInputSchema,
  ContentDetailInputSchema,
  ContentEnrollInputSchema,
  ContentActionBodySchema,
} from './content.schema.js';

export async function contentRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: { body: ContentActionBodySchema },
    },
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'list': {
          // list 公开（游客可看）
          const input = ContentListInputSchema.parse(payload ?? {});
          return { code: 0, data: await contentService.list(input) };
        }

        case 'detail': {
          const input = ContentDetailInputSchema.parse(payload);
          return { code: 0, data: await contentService.detail(input.id) };
        }

        case 'enroll': {
          if (!req.user) throw Errors.unauthorized();
          const input = ContentEnrollInputSchema.parse(payload);
          return { code: 0, data: await contentService.enroll(req.user.id, input) };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
