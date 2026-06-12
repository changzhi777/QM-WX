/**
 * content module routes — POST /api/content
 *
 * list / detail 是公开端点（游客可看），enroll 需登录。
 * 因走单 POST 入口 + action dispatch，无法让 auth 中间件按 action 分流，
 * 所以整 endpoint 标 public，enroll 内部主动 jwtVerify。
 */
import type { FastifyInstance } from 'fastify';
import { contentService } from './content.service.js';
import { requireLogin } from '../../common/middleware/auth.js';
import {
  ContentListInputSchema,
  ContentDetailInputSchema,
  ContentEnrollInputSchema,
} from './content.schema.js';

export async function contentRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      config: { public: true }, // list/detail 公开；enroll 内部自鉴权
    },
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'list': {
          const input = ContentListInputSchema.parse(payload ?? {});
          return { code: 0, data: await contentService.list(input) };
        }

        case 'detail': {
          const input = ContentDetailInputSchema.parse(payload);
          return { code: 0, data: await contentService.detail(input.id) };
        }

        case 'enroll': {
          const user = await requireLogin(req);
          const input = ContentEnrollInputSchema.parse(payload);
          return { code: 0, data: await contentService.enroll(user.id, input) };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
