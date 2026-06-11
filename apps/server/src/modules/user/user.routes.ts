/**
 * user module routes — POST /api/user
 *
 * Action 路由模式：body = { action, payload }
 */
import type { FastifyInstance } from 'fastify';
import { userService } from './user.service.js';
import { Errors } from '../../common/errors.js';
import {
  LoginInputSchema,
  UpdateProfileInputSchema,
  BindAppsInputSchema,
  ActionBodySchema,
} from './user.schema.js';

export async function userRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: { body: ActionBodySchema },
      config: { public: true }, // login 不需要已登录
    },
    async (req, reply) => {
      const { action, payload } = req.body as { action: string; payload: unknown };

      switch (action) {
        case 'login': {
          const input = LoginInputSchema.parse(payload);
          const result = await userService.login(app, input);
          return { code: 0, data: result };
        }

        case 'updateProfile': {
          // 需鉴权（auth middleware 已挂）
          if (!req.user) throw Errors.unauthorized();
          const input = UpdateProfileInputSchema.parse(payload);
          const user = await userService.updateProfile(req.user.id, input);
          return { code: 0, data: { user } };
        }

        case 'bindApps': {
          if (!req.user) throw Errors.unauthorized();
          const input = BindAppsInputSchema.parse(payload);
          const user = await userService.bindApps(req.user.id, input);
          return { code: 0, data: { user } };
        }

        case 'me': {
          // 拿当前登录 user + config
          if (!req.user) throw Errors.unauthorized();
          const user = await userService.getById(req.user.id);
          const config = await (await import('../app-config/app-config.repository.js'))
            .configRepo.getLoginConfig();
          return { code: 0, data: { user, config } };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
