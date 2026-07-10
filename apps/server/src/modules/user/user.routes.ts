/**
 * user module routes — POST /api/user
 *
 * Action 路由模式：body = { action, payload }
 */
import type { FastifyInstance } from 'fastify';
import { userService } from './user.service.js';
import { requireLogin } from '../../common/middleware/auth.js';
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
      config: { public: true }, // login 不需要已登录
    },
    async (req, reply) => {
      const { action, payload } = ActionBodySchema.parse(req.body);

      switch (action) {
        case 'login': {
          const input = LoginInputSchema.parse(payload);
          const result = await userService.login(app, input);
          return { code: 0, data: result };
        }

        case 'updateProfile': {
          // public 路由内显式鉴权：authPlugin 对 public:true 跳过 jwtVerify，
          // 受保护 action 须主动 requireLogin（否则 req.user 恒 undefined → 401）
          const authUser = await requireLogin(req);
          const input = UpdateProfileInputSchema.parse(payload);
          const user = await userService.updateProfile(authUser.id, input);
          return { code: 0, data: { user } };
        }

        case 'bindApps': {
          const authUser = await requireLogin(req);
          const input = BindAppsInputSchema.parse(payload);
          const user = await userService.bindApps(authUser.id, input);
          return { code: 0, data: { user } };
        }

        case 'me': {
          // 拿当前登录 user + config
          const authUser = await requireLogin(req);
          const user = await userService.getById(authUser.id);
          const config = await (await import('../app-config/app-config.repository.js'))
            .configRepo.getLoginConfig();
          return { code: 0, data: { user, config } };
        }

        case 'completeOnboarding': {
          const authUser = await requireLogin(req);
          const data = await userService.completeOnboarding(authUser.id);
          return { code: 0, data };
        }

        case 'resetOnboarding': {
          // V0.1.44 重新激活：onboardingDone=false，前端跳向导重新填资料/授权
          const authUser = await requireLogin(req);
          const data = await userService.resetOnboarding(authUser.id);
          return { code: 0, data };
        }

        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
