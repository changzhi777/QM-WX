/**
 * device/garmin-health.ts — A 路线：Garmin Health API 官方（OAuth 1.0a + push 回调）
 *
 * ⚠️ 需申请 Garmin Health API（https://developer.garmin.com/gc-developer-program/health-api/）
 *    获取 Consumer Key/Secret 后配 env GARMIN_CONSUMER_KEY / GARMIN_CONSUMER_SECRET
 *
 * 流程（3-legged OAuth 1.0a）：
 *   1. 后端调 /oauth/request_token → 获取 request token
 *   2. 用户跳转 /oauth/authorize 授权 → 回调带 verifier
 *   3. 后端调 /oauth/access_token → 获取 access token（用户级）
 *   4. 用户同步设备 → Garmin push JSON 到 /api/device/garmin-health-webhook → 落库
 *
 * 数据格式：JSON（活动/心率/步数/睡眠/压力 等）
 * 文档：https://openwearables.io/blog/garmin-api-push-notifications-how-callback-sync-works
 */
import { env } from '../../config/env.js';

const GARMIN_AUTH = 'https://connect.garmin.com/oauth';

/** 配置就绪（Consumer Key/Secret 齐全） */
export function isGarminHealthConfigured(): boolean {
  return Boolean(env.GARMIN_CONSUMER_KEY && env.GARMIN_CONSUMER_SECRET);
}

/** 第 1 步：生成 request token（用户授权前） */
export async function garminHealthRequestToken(): Promise<{
  url: string;
  configured: boolean;
  token?: string;
}> {
  const key = env.GARMIN_CONSUMER_KEY;
  const secret = env.GARMIN_CONSUMER_SECRET;
  if (!key || !secret) return { url: '', configured: false };

  // TODO: 调 GARMIN_BASE/oauth/request_token（OAuth 1.0a 签名）
  // 返 request_token + request_token_secret
  // 用户跳转 GARMIN_AUTH/oauth/authorize?oauth_token=request_token
  return {
    url: `${GARMIN_AUTH}/oauth/authorize?oauth_token=`,
    configured: true,
  };
}

/** 第 3 步：交换 access token（用户授权后回调带 verifier） */
export async function garminHealthAccessToken(
  _requestToken: string,
  _requestSecret: string,
  _verifier: string,
): Promise<{ token: string; secret: string } | null> {
  const key = env.GARMIN_CONSUMER_KEY;
  const secret = env.GARMIN_CONSUMER_SECRET;
  if (!key || !secret) return null;

  // TODO: 调 GARMIN_BASE/oauth/access_token（OAuth 1.0a 签名 + verifier）
  // 返 access_token + access_token_secret（用户级，存 DeviceBinding.accessTokenEnc）
  return null;
}

/**
 * 接收 Garmin push 回调（JSON → 落库）
 *
 * Garmin 用户同步设备时，push JSON 到注册的回调 URL
 * 数据类型：activities / health / sleep / stress / body_composition
 */
export async function garminHealthWebhook(body: unknown): Promise<{ ok: boolean; received: boolean }> {
  // TODO: 解析 push JSON + 落 RawActivity/GarminSleep/GarminMetric
  // body 格式：{ type: 'activities'|'health'|..., userId: 'terra-user-id', data: [...] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = body as any;
  if (!payload || !payload.type) {
    return { ok: false, received: false };
  }

  // TODO: 按 type 分发落库
  // - activities → RawActivity（vendor=garmin）
  // - health → GarminMetric
  // - sleep → GarminSleep

  return { ok: true, received: true };
}
