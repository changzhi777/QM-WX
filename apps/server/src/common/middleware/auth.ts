/**
 * JWT 鉴权中间件
 *
 * 任何 route 默认需登录；公开端点需在 routeOptions.config.public = true
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Errors } from '../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** 登录后的用户上下文，route 内可直接 req.user.openid  */
    user: {
      id: string;
      openid: string;
    };
  }
  interface FastifyContextConfig {
    /** 标记为公开端点，跳过 JWT 校验 */
    public?: boolean;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (req.routeOptions.config?.public) return;
    try {
      await req.jwtVerify();
      // TODO Phase 1: 从 DB 取完整用户上下文
      req.user = {
        id: (req.user as { sub: string }).sub,
        openid: (req.user as { openid: string }).openid,
      };
    } catch {
      throw Errors.unauthorized();
    }
  });
});
