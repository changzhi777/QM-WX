/**
 * 功能开关中间件
 *
 * 从 app_config.feature_flags 读开关；关闭时 403。
 * 启动时预读 + admin setConfig 时主动失效。
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

/** 模块级缓存实例，供 admin setConfig 失效用 */
let _cache: Record<FeatureFlag, boolean> | null = null;

/** 外部调用：清缓存，下次请求时重读 DB */
export function invalidateFeatureFlagsCache(): void {
  _cache = null;
}

export const featureGatePlugin = fp(async (app: FastifyInstance) => {
  const getFlags = async () => {
    if (!_cache) _cache = await configRepo.getFeatureFlags();
    return _cache;
  };

  // 启动钩子：预热
  app.addHook('onReady', async () => {
    _cache = await configRepo.getFeatureFlags();
    app.log.info({ flags: _cache }, 'feature_flags loaded from db');
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
