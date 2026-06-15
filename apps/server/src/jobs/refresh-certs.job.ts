/**
 * jobs/refresh-certs.job.ts — 定时刷新微信平台证书
 *
 * 平台证书会定期轮换。定时拉取并缓存最新证书，保证回调验签时
 * getPlatformCert 总能按 Wechatpay-Serial 命中正确证书（含轮换并存期）。
 *
 * 触发：queue.ts 在 startJobs 时注册 12h repeatable job（仅在微信支付已配置时）。
 */
import { fetchPlatformCerts } from '../modules/wxpay/wxpay.service.js';
import { logger } from '../common/logger.js';

export async function processRefreshPlatformCerts(): Promise<{ serials: string[] }> {
  const serials = await fetchPlatformCerts();
  logger.info({ count: serials.length, serials }, 'platform certs refreshed');
  return { serials };
}
