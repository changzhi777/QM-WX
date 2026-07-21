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
      jti?: string;  // refresh token 唯一 id（一次性轮换 + 复用检测）
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
    // V0.2.63 静态资源跳过 JWT（@fastify/static 托管的 /h5/ H5 页 + /uploads/ 文件）
    const u = req.url;
    if (u.startsWith('/h5/') || u.startsWith('/uploads/')) return;
    try {
      await req.jwtVerify();
    } catch {
      throw Errors.unauthorized();
    }
  });
});

/**
 * 公开 endpoint 内，对受保护 action 显式鉴权（短路 jwtVerify）。
 *
 * 用法（route.ts 内）：
 * ```ts
 * const user = await requireLogin(req);  // 已鉴权 → 直接拿 user；未鉴权 → 401
 * ```
 *
 * 设计：当 endpoint 标 `config.public: true`（比如 list / detail 公开）
 * 时，authPlugin 跳过 jwtVerify，受保护 action（如 enroll / createOrder）
 * 需主动调用本函数补鉴权。
 */
export async function requireLogin(req: FastifyRequest) {
  if (!req.user) {
    try {
      await req.jwtVerify();
    } catch {
      throw Errors.unauthorized();
    }
  }
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}
