/**
 * 功能开关中间件
 *
 * 从 app_config.feature_flags 读开关；关闭时 403。
 * 应用启动时预读一次缓存；Phase 3 起 admin setConfig 时主动失效。
 */
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Errors } from '../errors.js';
import { configRepo } from '../../modules/app-config/app-config.repository.js';
import type { FeatureFlag } from '@qm-wx/shared';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** 路由所需的功能开关名（来自 @qm-wx/shared FEATURE_FLAGS） */
    requireFeature?: FeatureFlag;
  }
}

export const featureGatePlugin = fp(async (app: FastifyInstance) => {
  // 启动时预读一次；Phase 1.1 加 Redis 缓存 / 主动失效
  let cache: Record<FeatureFlag, boolean> | null = null;
  const getFlags = async () => {
    if (!cache) cache = await configRepo.getFeatureFlags();
    return cache;
  };

  // 启动钩子：预热
  app.addHook('onReady', async () => {
    cache = await configRepo.getFeatureFlags();
    app.log.info({ flags: cache }, 'feature_flags loaded from db');
  });

  app.addHook('onRequest', async (req) => {
    const feature = req.routeOptions.config?.requireFeature;
    if (!feature) return;
    const flags = await getFlags();
    if (!flags[feature]) {
      throw Errors.featureDisabled(feature);
    }
  });
});
