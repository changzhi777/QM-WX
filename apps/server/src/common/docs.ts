/**
 * API 文档路由（OpenAPI JSON spec）
 *
 * 路由：
 * - GET /openapi.json   暴露 OpenAPI 3.1 spec（机器可读）
 *
 * 设计：手写 OpenAPI spec（不引第三方 OpenAPI 库）— 优点是 100% 控制、零依赖；
 * 缺点是新 module / 新 action 需手动登记 path。
 *
 * 渲染：spec 可被任何工具消费
 * - Swagger UI（standalone HTML，CDN 引）
 * - Redocly（CLI 生成静态站）
 * - Postman / Insomnia / Bruno（导入 openapi.json 即可）
 * - Stoplight Elements（CDN）
 *
 * 原计划用 @scalar/fastify-api-reference 做内置 /docs UI，
 * 但在 fastify 4 + pnpm 9 + 我们的 env 下 route 不注册
 * （已实测 1.50.0 / 1.59.3 都不行，根因是 fastify-plugin 多版本嵌套）。
 * 简化方案：只暴露 JSON spec，不做内置 UI — 不影响 API 文档可用性。
 */
import type { FastifyInstance } from 'fastify';
import { openapiSpec } from './openapi-spec.js';

export async function registerDocsRoutes(app: FastifyInstance) {
  // 公开端点（不走 JWT）— 任何人都能拉 spec
  app.get('/openapi.json', { config: { public: true } }, async () => openapiSpec);
}
