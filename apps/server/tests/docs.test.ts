/**
 * API 文档路由单测
 *
 * 覆盖：
 * - GET /openapi.json → 200 + openapi 3.1 + 含 6+ paths + schemas + wxpay 公开标记
 *
 * 注：原计划用 @scalar/fastify-api-reference 做内置 /docs UI，
 * 但在 fastify 4 + pnpm 9 + 我们的 env 下 route 不注册（已实测 1.50.0 / 1.59.3）。
 * 简化方案：只暴露 JSON spec，UI 用外部工具（Swagger UI / Redocly / Postman）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDocsRoutes } from '../src/common/docs.js';

describe('API 文档路由（OpenAPI 3.1 spec）', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await registerDocsRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /openapi.json → 200 + openapi 3.1 spec', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const spec = res.json() as Record<string, unknown>;
    expect(spec.openapi).toMatch(/^3\.\d+\.\d+/);
    expect((spec.info as { title?: string }).title).toBe('QM-WX API');
  });

  it('GET /openapi.json 包含 6+ paths（auth/user/mall/sport/wxpay/admin）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { paths: Record<string, unknown> };
    const pathKeys = Object.keys(spec.paths);
    expect(pathKeys.length).toBeGreaterThanOrEqual(6);
    expect(pathKeys).toEqual(
      expect.arrayContaining([
        '/api/auth/refresh',
        '/api/user',
        '/api/mall',
        '/api/sport',
        '/api/wxpay',
        '/api/admin',
      ]),
    );
  });

  it('GET /openapi.json 包含 schemas（User / Product / Order / RefundOrderInput 等）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { components: { schemas: Record<string, unknown> } };
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas).toEqual(
      expect.arrayContaining([
        'User',
        'Product',
        'Order',
        'RefundOrderInput',
        'CheckinInput',
      ]),
    );
  });

  it('GET /openapi.json 标了 wxpay 为公开端点（security=空数组）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { paths: Record<string, { post?: { security?: unknown[] } }> };
    const wxpayPost = spec.paths['/api/wxpay'].post;
    expect(wxpayPost?.security).toEqual([]); // 公开
  });
});
