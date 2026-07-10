/**
 * Fastify 应用装配（无 listen，无 jobs）
 *
 * 拆分目的：让 e2e 测试复用同一份路由/中间件装配，避免 dev server 抢 BullMQ 队列
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
import { registerDocsRoutes } from './common/docs.js';
import { userRoutes } from './modules/user/user.routes.js';
import { sportRoutes } from './modules/sport/sport.routes.js';
import { mallRoutes } from './modules/mall/mall.routes.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { uploadRoutes } from './modules/upload/upload.routes.js';
import { wxpayRoutes } from './modules/wxpay/wxpay.routes.js';
import { weeklyReportRoutes } from './modules/weekly-report/weekly-report.routes.js';
import { deviceRoutes } from './modules/device/device.routes.js';
import { recipeRoutes } from './modules/recipe/recipe.routes.js';
import { ludongRoutes } from './modules/ludong/ludong.routes.js';
import { statsRoutes } from './modules/stats/stats.routes.js';
import { rankingRoutes } from './modules/ranking/ranking.routes.js';
import { cartRoutes } from './modules/cart/cart.routes.js';
import { pointsRoutes } from './modules/points/points.routes.js';
import { addressRoutes } from './modules/address/address.routes.js';
import { couponRoutes } from './modules/coupon/coupon.routes.js';
import { distributionRoutes } from './modules/distribution/distribution.routes.js';
import { trainingRoutes } from './modules/training/training.routes.js';
import { shoesRoutes } from './modules/shoes/shoes.routes.js';
import { goalRoutes } from './modules/goal/goal.routes.js';
import { favoriteRoutes } from './modules/favorite/favorite.routes.js';
import { feedRoutes } from './modules/feed/feed.routes.js';
import { notificationRoutes } from './modules/notification/notification.routes.js';
import { followRoutes } from './modules/follow/follow.routes.js';
import { familyRoutes } from './modules/family/family.routes.js';
import { groupBuyRoutes } from './modules/group-buy/group-buy.routes.js';
import { reviewRoutes } from './modules/review/review.routes.js';
import { BusinessError } from './common/errors.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  // ===== 原始 body 保留 =====
  // 微信支付 V3 回调验签必须对「原始字节」做 RSA 校验。Fastify 默认会先 JSON.parse，
  // 重新序列化的字节与微信发出的原文不一致会导致验签恒失败。这里改用 parseAs:'string'，
  // 把原始字符串挂到 req.rawBody，同时仍向其它路由提供解析后的对象。
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      (req as unknown as { rawBody?: string }).rawBody = body as string;
      if (!body) {
        done(null, undefined);
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        (err as { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    },
  );

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

  // ===== API 文档（OpenAPI 3.1 + Scalar UI）=====
  await registerDocsRoutes(app);

  // ===== 健康检查 =====
  app.get('/health', { config: { public: true } }, async () => ({
    status: 'ok',
    uptime: process.uptime(),
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }));

  // ===== 统一错误处理（必须在 route 注册前，Fastify 4 才会对 hook/route 抛错生效）=====
  app.setErrorHandler((err, req, reply) => {
    // duck-typing 兜底（Fastify 4 可能破坏 instanceof 链，同 ZodError 处理）
    if (err instanceof BusinessError || (err as { name?: string }).name === 'BusinessError') {
      const be = err as unknown as BusinessError;
      return reply.status(be.statusCode).send({ code: be.code, msg: be.message });
    }
    // duck-typing 检查 ZodError（fastify 4 可能破坏 instanceof 链）
    const issues = (err as { issues?: unknown[]; errors?: unknown[] }).issues
      ?? (err as { errors?: unknown[] }).errors;
    if (Array.isArray(issues) && issues.length > 0) {
      const first = issues[0] as { path: (string | number)[]; message: string };
      const path = first.path.join('.');
      return reply.status(400).send({ code: 400, msg: `${path}: ${first.message}` });
    }
    req.log.error({ err: { name: err?.name, type: (err as { type?: string })?.type, msg: String(err?.message).slice(0, 200) } }, 'unhandled error');
    return reply.status(500).send({ code: 500, msg: '服务器内部错误' });
  });

  // ===== 业务路由 =====
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(userRoutes, { prefix: '/api/user' });
  await app.register(sportRoutes, { prefix: '/api/sport' });
  await app.register(mallRoutes, { prefix: '/api/mall' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(walletRoutes, { prefix: '/api/wallet' });
  await app.register(weeklyReportRoutes, { prefix: '/api/weekly-report' });
  await app.register(deviceRoutes, { prefix: '/api/device' });
  await app.register(recipeRoutes, { prefix: '/api/recipe' });
  await app.register(ludongRoutes, { prefix: '/api/ludong' });
  await app.register(statsRoutes, { prefix: '/api/stats' });
  await app.register(rankingRoutes, { prefix: '/api/ranking' });
  await app.register(cartRoutes, { prefix: '/api/cart' });
  await app.register(pointsRoutes, { prefix: '/api/points' });
  await app.register(addressRoutes, { prefix: '/api/address' });
  await app.register(couponRoutes, { prefix: '/api/coupon' });
  await app.register(distributionRoutes, { prefix: '/api/distribution' });
  await app.register(trainingRoutes, { prefix: '/api/training' });
  await app.register(shoesRoutes, { prefix: '/api/shoes' });
  await app.register(goalRoutes, { prefix: '/api/goal' });
  await app.register(favoriteRoutes, { prefix: '/api/favorite' });
  await app.register(feedRoutes, { prefix: '/api/feed' });
  await app.register(notificationRoutes, { prefix: '/api/notification' });
  await app.register(followRoutes, { prefix: '/api/follow' });
  await app.register(familyRoutes, { prefix: '/api/family' });
  await app.register(groupBuyRoutes, { prefix: '/api/group-buy' });
  await app.register(reviewRoutes, { prefix: '/api/review' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(wxpayRoutes, { prefix: '/api/wxpay' });

  return app;
}
