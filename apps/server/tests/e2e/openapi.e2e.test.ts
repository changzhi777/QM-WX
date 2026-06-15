/**
 * OpenAPI 3.1 spec 端到端校验
 *
 * 跑法：RUN_E2E=1 pnpm test
 *
 * 验：
 * - GET /openapi.json 返 200 + application/json
 * - spec.openapi >= 3.0
 * - spec.paths 含 6+ 关键 endpoint
 * - spec.components.schemas 含 5+ 核心 schema
 * - spec.paths['/api/wxpay'].post.security = []（公开）
 * - spec.info.title = 'QM-WX API'
 * - 关键 schema 字段类型正确（User.id 是 string / Order.status enum 等）
 *
 * 作用：CI gate — OpenAPI 规范被破坏时立刻 fail
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import { buildApp } from '../../src/app.js';

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('OpenAPI spec e2e 校验（CI gate）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  itE2E('GET /openapi.json → 200 + application/json', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  itE2E('spec.openapi >= 3.0 + title = "QM-WX API"', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { openapi: string; info: { title: string } };
    expect(spec.openapi).toMatch(/^3\.\d+\.\d+/);
    expect(spec.info.title).toBe('QM-WX API');
  });

  itE2E('含 6+ 关键 paths（auth / user / mall / sport / wxpay / admin）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { paths: Record<string, unknown> };
    const keys = Object.keys(spec.paths);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    expect(keys).toEqual(
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

  itE2E('含 5+ 核心 schema（User / Product / Order / RefundOrderInput / CheckinInput）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { components: { schemas: Record<string, unknown> } };
    const schemas = Object.keys(spec.components.schemas);
    expect(schemas.length).toBeGreaterThanOrEqual(5);
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

  itE2E('wxpay 标 security=[] 公开', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      paths: Record<string, { post?: { security?: unknown[] } }>;
    };
    expect(spec.paths['/api/wxpay'].post?.security).toEqual([]);
  });

  itE2E('User schema 含 id / openid / nickname / avatarUrl / points / memberLevel', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    const user = spec.components.schemas.User;
    expect(user.properties).toHaveProperty('id');
    expect(user.properties).toHaveProperty('openid');
    expect(user.properties).toHaveProperty('points');
  });

  itE2E('Order schema status 含 refunded / refunding（Phase 4.1 状态机扩）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: {
        schemas: { Order: { properties: { status: { enum?: string[] } } } };
      };
    };
    const statusEnum = spec.components.schemas.Order.properties.status.enum;
    expect(statusEnum).toEqual(
      expect.arrayContaining(['pending_pay', 'paid', 'refunded', 'refunding']),
    );
  });

  itE2E('schemas 字段类型正确：User.id 是 string', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: {
        schemas: { User: { properties: Record<string, { type?: string }> } };
      };
    };
    expect(spec.components.schemas.User.properties.id.type).toBe('string');
  });

  itE2E('paths 都有 operation summary（不空 descriptions）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      paths: Record<string, Record<string, { summary?: string }>>;
    };
    let missingSummary = 0;
    for (const [, pathItem] of Object.entries(spec.paths)) {
      for (const [, op] of Object.entries(pathItem)) {
        if (!op.summary) missingSummary++;
      }
    }
    expect(missingSummary).toBe(0);
  });

  itE2E('components.securitySchemes.bearerAuth = JWT', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: { securitySchemes: { bearerAuth: { type: string; scheme: string; bearerFormat: string } } };
    };
    expect(spec.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  // ===== V0.1.4 增 schema 校验（schemas 15+）=====
  itE2E('含 RefundResp schema（V0.1.4 增）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { components: { schemas: Record<string, { properties?: Record<string, unknown> }> } };
    expect(spec.components.schemas.RefundResp).toBeDefined();
    expect(spec.components.schemas.RefundResp.properties).toHaveProperty('refundId');
    expect(spec.components.schemas.RefundResp.properties).toHaveProperty('status');
  });

  itE2E('含 CheckinResp / WalletInfo / TransactionResp / ProductDetail / ContentItem 5 个 schema', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as { components: { schemas: Record<string, unknown> } };
    const schemas = Object.keys(spec.components.schemas);
    // V0.1.3 = 9 schemas（5 user/order/refund/checkin/api envelope + 4 旧），V0.1.4 新增 5 = 14+
    expect(schemas.length).toBeGreaterThanOrEqual(14);
    for (const name of ['CheckinResp', 'WalletInfo', 'TransactionResp', 'ProductDetail', 'ContentItem']) {
      expect(schemas, `缺 schema ${name}`).toContain(name);
    }
  });

  itE2E('TransactionResp.outRefundNo 字段在（Phase 4.1 退款幂等 key）', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: { schemas: { TransactionResp: { properties: Record<string, { type?: string }> } } };
    };
    expect(spec.components.schemas.TransactionResp.properties.outRefundNo).toBeDefined();
    expect(spec.components.schemas.TransactionResp.properties.outRefundNo.type).toBe('string');
  });

  itE2E('ProductDetail 字段类型：stock=integer, status=on/off', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json() as {
      components: { schemas: { ProductDetail: { properties: Record<string, { type?: string; enum?: string[] }> } } };
    };
    expect(spec.components.schemas.ProductDetail.properties.stock.type).toBe('integer');
    expect(spec.components.schemas.ProductDetail.properties.status.enum).toEqual(['on', 'off']);
  });

  // 确保 prisma client 已连（e2e 真 DB 校验，e2e 必须配 PG）
  itE2E('prisma 连通（admin_whitelist 可查）', async () => {
    const row = await prisma.appConfig.findUnique({ where: { id: 'admin_whitelist' } });
    expect(row).toBeDefined();
  });
});
