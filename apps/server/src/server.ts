/**
 * Fastify 应用入口
 *
 * 启动顺序：
 * 1. 环境变量校验（env.ts 已 fail-fast）
 * 2. 基础插件（cors / helmet / rate-limit / jwt）
 * 3. 业务中间件（auth / feature-gate）
 * 4. 6 个 module 路由
 * 5. 错误处理
 * 6. health check
 * 7. listen
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { join } from 'node:path';
import { env } from './config/env.js';
import { authPlugin } from './common/middleware/auth.js';
import { featureGatePlugin } from './common/middleware/feature-gate.js';
import { userRoutes } from './modules/user/user.routes.js';
import { sportRoutes } from './modules/sport/sport.routes.js';
import { mallRoutes } from './modules/mall/mall.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { uploadRoutes } from './modules/upload/upload.routes.js';
import { weeklyReportRoutes } from './modules/weekly-report/weekly-report.routes.js';
import { BusinessError } from './common/errors.js';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
});

// ===== 基础插件 =====
await app.register(helmet);
await app.register(cors, {
  origin: env.CORS_ORIGINS.split(',').filter(Boolean),
  credentials: true,
});
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
await app.register(staticFiles, {
  root: join(process.cwd(), 'uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});
await app.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_ACCESS_TTL },
});

// ===== 业务中间件 =====
await app.register(authPlugin);
await app.register(featureGatePlugin);

// ===== 健康检查 =====
app.get('/health', { config: { public: true } }, async () => ({
  status: 'ok',
  uptime: process.uptime(),
  env: env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

// ===== 业务路由 =====
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(uploadRoutes, { prefix: '/api/upload' });
await app.register(userRoutes, { prefix: '/api/user' });
await app.register(sportRoutes, { prefix: '/api/sport' });
await app.register(mallRoutes, { prefix: '/api/mall' });
await app.register(contentRoutes, { prefix: '/api/content' });
await app.register(walletRoutes, { prefix: '/api/wallet' });
await app.register(weeklyReportRoutes, { prefix: '/api/weekly-report' });
await app.register(adminRoutes, { prefix: '/api/admin' });

// ===== 统一错误处理 =====
app.setErrorHandler((err, req, reply) => {
  if (err instanceof BusinessError) {
    return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
  }
  req.log.error({ err }, 'unhandled error');
  return reply.status(500).send({ code: 500, msg: '服务器内部错误' });
});

// ===== 启动 =====
try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`🚀 @qm-wx/server listening on http://${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
