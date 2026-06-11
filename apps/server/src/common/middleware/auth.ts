/**
 * JWT 鉴权中间件
 *
 * 任何 route 默认需登录；公开端点需在 routeOptions.config.public = true
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Errors } from '../errors.js';

// 扩展 @fastify/jwt 的 payload 类型（避免直接覆写 FastifyRequest.user 导致冲突）
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;   // userId（JWT 标准索赔）
      id: string;    // userId（业务兼容）
      openid: string;
      kind?: string; // 'refresh' | undefined（access token）
      iat?: number;
      exp?: number;
    };
    user: {
      sub: string;
      id: string;
      openid: string;
      kind?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /** 标记为公开端点，跳过 JWT 校验 */
    public?: boolean;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (req.routeOptions.config?.public) return;
    try {
      await req.jwtVerify();
    } catch {
      throw Errors.unauthorized();
    }
  });
});
