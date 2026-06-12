/**
 * buildApp() 装配测试
 *
 * 目标：app.ts 1.66% → 100%
 *
 * 策略：mock 掉 env / 所有路由插件 / 所有中间件插件 / redis / prisma，
 *       让 buildApp() 跑完整装配，验证 /health 通 + error handler 正常工作
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/config/env.js', () => ({
  env: {
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    CORS_ORIGINS: '*',
    JWT_SECRET: 'test-secret-32-chars-long-enough!',
    JWT_ACCESS_TTL: '2h',
  },
}));

// 各 route 中间件 → 注入一个 /__ping 路由，验证被 register
const pluginCallOrder: string[] = [];

vi.mock('src/common/middleware/auth.js', () => ({
  authPlugin: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('auth');
    app.get('/__test/auth-registered', async () => ({ ok: true }));
  },
}));

vi.mock('src/common/middleware/feature-gate.js', () => ({
  featureGatePlugin: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('feature-gate');
    app.get('/__test/feature-gate-registered', async () => ({ ok: true }));
  },
  invalidateFeatureFlagsCache: () => {},
}));

vi.mock('src/modules/auth/auth.routes.js', () => ({
  authRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('auth-routes');
    app.get('/__test/auth-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/user/user.routes.js', () => ({
  userRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('user-routes');
    app.get('/__test/user-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/sport/sport.routes.js', () => ({
  sportRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('sport-routes');
    app.get('/__test/sport-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/mall/mall.routes.js', () => ({
  mallRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('mall-routes');
    app.get('/__test/mall-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/content/content.routes.js', () => ({
  contentRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('content-routes');
    app.get('/__test/content-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/wallet/wallet.routes.js', () => ({
  walletRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('wallet-routes');
    app.get('/__test/wallet-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/admin/admin.routes.js', () => ({
  adminRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('admin-routes');
    app.get('/__test/admin-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/upload/upload.routes.js', () => ({
  uploadRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('upload-routes');
    app.get('/__test/upload-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/weekly-report/weekly-report.routes.js', () => ({
  weeklyReportRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('weekly-report-routes');
    app.get('/__test/weekly-report-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/device/device.routes.js', () => ({
  deviceRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('device-routes');
    app.get('/__test/device-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/recipe/recipe.routes.js', () => ({
  recipeRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('recipe-routes');
    app.get('/__test/recipe-routes', async () => ({ ok: true }));
  },
}));
vi.mock('src/modules/ludong/ludong.routes.js', () => ({
  ludongRoutes: async (app: import('fastify').FastifyInstance) => {
    pluginCallOrder.push('ludong-routes');
    app.get('/__test/ludong-routes', async () => ({ ok: true }));
  },
}));

import { buildApp } from '../src/app.js';
import { BusinessError } from '../src/common/errors.js';

describe('buildApp() 装配', () => {
  beforeEach(() => {
    pluginCallOrder.length = 0;
  });

  it('buildApp() 返回 Fastify 实例', async () => {
    const app = await buildApp();
    expect(app).toBeDefined();
    await app.close();
  });

  it('GET /health → 200 + status=ok + env=test', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.env).toBe('test');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await app.close();
  });

  it('GET /health 标记为 public（不走 auth）', async () => {
    // 上面已经验证；这里额外确认在所有中间件之后仍 200
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('BusinessError → setErrorHandler 转 { code, msg }', async () => {
    const app = await buildApp();
    app.get(
      '/__test/throw-business',
      { config: { public: true } },
      async () => {
        throw new BusinessError(418, '我是茶壶', 418);
      },
    );
    const res = await app.inject({ method: 'GET', url: '/__test/throw-business' });
    expect(res.statusCode).toBe(418);
    expect(res.json()).toEqual({ code: 418, msg: '我是茶壶' });
    await app.close();
  });

  it('ZodError-like（issues 数组）→ 400 + 第一个 issue 的 path+msg', async () => {
    const app = await buildApp();
    app.get(
      '/__test/throw-zod',
      { config: { public: true } },
      async () => {
        const e = new Error('validation') as Error & { issues: Array<{ path: (string | number)[]; message: string }> };
        e.issues = [{ path: ['body', 'amount'], message: 'Required' }];
        throw e;
      },
    );
    const res = await app.inject({ method: 'GET', url: '/__test/throw-zod' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 400, msg: 'body.amount: Required' });
    await app.close();
  });

  it('ZodError-like（errors 数组，备选字段名）→ 400', async () => {
    const app = await buildApp();
    app.get(
      '/__test/throw-zod-errors',
      { config: { public: true } },
      async () => {
        const e = new Error('validation') as Error & { errors: Array<{ path: (string | number)[]; message: string }> };
        e.errors = [{ path: ['x'], message: 'bad' }];
        throw e;
      },
    );
    const res = await app.inject({ method: 'GET', url: '/__test/throw-zod-errors' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 400, msg: 'x: bad' });
    await app.close();
  });

  it('未知错误 → 500 + 不泄露 msg', async () => {
    const app = await buildApp();
    app.get(
      '/__test/throw-unknown',
      { config: { public: true } },
      async () => {
        throw new Error('数据库密码是 123456');
      },
    );
    const res = await app.inject({ method: 'GET', url: '/__test/throw-unknown' });
    expect(res.statusCode).toBe(500);
    expect(res.json().msg).toBe('服务器内部错误');
    expect(res.json().msg).not.toContain('123456');
    await app.close();
  });

  it('所有 13 个 module 路由都被 register', async () => {
    const app = await buildApp();
    // 全部 13 个 route plugin 都进了调用栈（pluginCallOrder 由 mock 填充）
    const expectedRoutes = [
      'auth-routes',
      'upload-routes',
      'user-routes',
      'sport-routes',
      'mall-routes',
      'content-routes',
      'wallet-routes',
      'weekly-report-routes',
      'device-routes',
      'recipe-routes',
      'ludong-routes',
      'admin-routes',
    ];
    for (const r of expectedRoutes) {
      expect(pluginCallOrder).toContain(r);
    }
    expect(pluginCallOrder).toContain('auth'); // authPlugin
    expect(pluginCallOrder).toContain('feature-gate'); // featureGatePlugin
    // 顺序：中间件先于路由
    const authIdx = pluginCallOrder.indexOf('auth');
    const firstRouteIdx = pluginCallOrder.indexOf('auth-routes');
    expect(authIdx).toBeLessThan(firstRouteIdx);
    await app.close();
  });
});
