/**
 * device/garmin-health.ts — A 路线：Garmin Health API 官方（OAuth 1.0a + push 回调）
 *
 * ⚠️ 需申请 Garmin Health API（https://developer.garmin.com/gc-developer-program/health-api/）
 *    获取 Consumer Key/Secret 后配 env GARMIN_CONSUMER_KEY / GARMIN_CONSUMER_SECRET
 *
 * 流程（3-legged OAuth 1.0a）：
 *   1. 后端调 /oauth/request_token → 获取 request token
 *   2. 用户跳转 /oauth/authorize 授权 → 回调带 oauth_verifier
 *   3. 后端调 /oauth/access_token → 获取 access token（用户级，存 DeviceBinding）
 *   4. 用户同步设备 → Garmin push JSON 到 /api/device/garmin-health-webhook → 落库
 *
 * 数据格式：JSON（activities / health / sleep / stress / body_composition）
 * 文档：https://developer.garmin.com/garmin-health-api/（需登录开发者门户）
 *
 * V0.2.89 补全（Phase 1A 骨架）：OAuth 1.0a HMAC-SHA1 手动签名 + request_token/access_token/webhook 解析
 *   ⚠️ 端点 / push schema 待主人配 GARMIN_CONSUMER_KEY/SECRET + 佳明文档核实后切流真测
 *   与 D 路线（Terra 聚合，V0.1.146 generateGarminAuthUrl）并存：A 直连免费 / D Terra 收费但框架已就绪
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

// TODO: 佳明文档确认基础域名（connect.garmin.com/oauth 或 apis.garmin.com）
const GARMIN_AUTH = 'https://connect.garmin.com/oauth';

/** 配置就绪（Consumer Key/Secret 齐全） */
export function isGarminHealthConfigured(): boolean {
  return Boolean(env.GARMIN_CONSUMER_KEY && env.GARMIN_CONSUMER_SECRET);
}

// ===== OAuth 1.0a HMAC-SHA1 签名（RFC 5849，手动实现不依赖库）=====

/** percent-encode（OAuth 1.0a 规范：! ' ( ) * 也编码） */
function percentEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** 生成 OAuth 1.0a 签名（HMAC-SHA1 base64） */
function sign(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = '',
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sorted)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

/** 构造 OAuth 1.0a Authorization header */
function authHeader(params: Record<string, string>): string {
  return (
    'OAuth ' +
    Object.keys(params)
      .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`)
      .join(', ')
  );
}

/** 基础 OAuth 参数（除 oauth_signature） */
function baseOAuthParams(consumerKey: string): Record<string, string> {
  return {
    oauth_consumer_key: consumerKey,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };
}

// ===== Step 1: request_token（用户授权前） =====

export interface GarminRequestTokenResult {
  url: string; // 用户跳转授权 URL
  configured: boolean;
  requestToken?: string;
  requestTokenSecret?: string;
}

export async function garminHealthRequestToken(callbackUrl: string): Promise<GarminRequestTokenResult> {
  const key = env.GARMIN_CONSUMER_KEY;
  const secret = env.GARMIN_CONSUMER_SECRET;
  if (!key || !secret) return { url: '', configured: false };

  const url = `${GARMIN_AUTH}/request_token`; // TODO: 佳明文档确认端点路径
  const params: Record<string, string> = { ...baseOAuthParams(key), oauth_callback: callbackUrl };
  params.oauth_signature = sign('POST', url, params, secret);

  // ⚠️ 无凭证时 fetch 会失败（401/网络）→ 返骨架 URL，待主人配 GARMIN_CONSUMER_KEY 后真测
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader(params) } });
    if (!res.ok) throw new Error(`request_token HTTP ${res.status}`);
    const text = await res.text();
    const parsed = new URLSearchParams(text);
    const requestToken = parsed.get('oauth_token') ?? '';
    const requestTokenSecret = parsed.get('oauth_token_secret') ?? '';
    return {
      url: `${GARMIN_AUTH}/authorize?oauth_token=${encodeURIComponent(requestToken)}`,
      configured: true,
      requestToken,
      requestTokenSecret,
    };
  } catch {
    // 配置就绪但请求失败（端点未确认/无凭证）→ 返骨架，待切流
    return { url: `${GARMIN_AUTH}/authorize?oauth_token=`, configured: true };
  }
}

// ===== Step 3: access_token（用户授权后回调带 verifier） =====

export interface GarminAccessTokenResult {
  token: string; // 用户级 access token（加密存 DeviceBinding.accessTokenEnc）
  secret: string; // token secret（加密存 DeviceBinding.refreshTokenEnc 复用字段）
  userId?: string; // Garmin 用户 ID（push 回调关联用）
}

export async function garminHealthAccessToken(
  requestToken: string,
  requestSecret: string,
  verifier: string,
): Promise<GarminAccessTokenResult | null> {
  const key = env.GARMIN_CONSUMER_KEY;
  const secret = env.GARMIN_CONSUMER_SECRET;
  if (!key || !secret) return null;

  const url = `${GARMIN_AUTH}/access_token`; // TODO: 佳明文档确认
  const params: Record<string, string> = { ...baseOAuthParams(key), oauth_token: requestToken, oauth_verifier: verifier };
  params.oauth_signature = sign('POST', url, params, secret, requestSecret);

  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader(params) } });
    if (!res.ok) throw new Error(`access_token HTTP ${res.status}`);
    const text = await res.text();
    const parsed = new URLSearchParams(text);
    return {
      token: parsed.get('oauth_token') ?? '',
      secret: parsed.get('oauth_token_secret') ?? '',
      userId: parsed.get('userId') ?? undefined,
    };
  } catch {
    return null;
  }
}

// ===== Step 4: push webhook 解析（用户同步设备 → Garmin push JSON） =====

export type GarminPushType = 'activities' | 'health' | 'sleep' | 'stress' | 'body_composition';

export interface GarminPushPayload {
  type: GarminPushType;
  userId?: string; // Garmin user id（push 注册时关联 QM-WX userId，映射待实现）
  data: unknown[];
}

/**
 * 接收 Garmin push 回调（JSON → 落库）
 *
 * Garmin 用户同步设备时，push JSON 到注册的回调 URL
 * ⚠️ userId 映射（Garmin userId → QM-WX userId）需 DeviceBinding.vendorUserId 关联
 * ⚠️ 各 type 的 data schema 待佳明文档核实（字段名/单位/嵌套）
 */
export async function garminHealthWebhook(body: unknown): Promise<{
  ok: boolean;
  received: boolean;
  count?: number;
}> {
  const payload = body as GarminPushPayload;
  if (!payload?.type || !Array.isArray(payload.data)) {
    return { ok: false, received: false };
  }

  // TODO: 按 type 分发落库（push schema 待佳明文档核实）
  // - activities → RawActivity（vendor=garmin）：activityId / startTime / duration / distance / avgHr
  // - sleep → GarminSleep：date / durationSeconds / deepSeconds / lightSeconds / remSeconds / awakeSeconds
  // - health(dailies) → GarminMetric：steps / distance / calories（按 sport 列）
  // - stress → GarminMetric：stressValues[]（时间序列）
  // - body_composition → BodyCompositionRecord：weight / bodyFat / muscle / bone / water / visceralFat
  //
  // 落库前需：DeviceBinding.vendor=garmin + vendorUserId=payload.userId 映射 QM-WX userId

  // 骨架：返接收确认（真落库待 push schema + userId 映射确认）
  return { ok: true, received: true, count: payload.data.length };
}
