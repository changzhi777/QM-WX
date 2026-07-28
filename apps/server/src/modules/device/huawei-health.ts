/**
 * device/huawei-health.ts — 华为运动健康 Cloud API OAuth 2.0 骨架（V0.3.18 + C 选项）
 *
 * ⚠️ 需申请华为运动健康 open platform（https://health.cloud.huawei.com）
 *    企业资质（穿戴设备厂商）+ AppID + AppSecret
 *    获取后配 env HUAWEI_APP_ID / HUAWEI_APP_SECRET
 *
 * 流程（3-legged OAuth 2.0 authorization_code grant）：
 *   1. 后端生成 authorize URL（state=userId 防 CSRF + Redis 暂存）
 *   2. 用户跳转华为 OAuth 授权 → 回调带 code + state
 *   3. 后端用 code 换 access_token + refresh_token（加密存 DeviceBinding.accessTokenEnc）
 *   4. 用户同步设备 → 后端用 access_token 拉华为 Health API（活动/心率/睡眠/体成分）
 *      或华为 push 回调（如果有 webhook 通道）
 *
 * 端点（华为 OAuth 2.0 标准）：
 *   authorize: https://oauth-login.cloud.huawei.com/oauth2/v3/authorize
 *   token:     https://oauth-login.cloud.huawei.com/oauth2/v3/token
 *   API base:  https://api.cloud.huawei.com/health/v1
 *
 * 文档：
 *   - 华为 OAuth 2.0: https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/account-oauth-000000111668-V5
 *   - 华为 Health Open API: https://developer.huawei.com/consumer/cn/hms/huawei-healthkit/
 *
 * V0.3.18 骨架（Phase C）：authorize URL + code 换 token + refresh + isConfigured 守卫
 *   凭据未配齐时返 stub URL + configured: false（前端可禁用入口）
 *   真测：主人配 HUAWEI_APP_ID/SECRET 后切流
 */
import { env } from '../../config/env.js';
import { prisma } from '../../infra/prisma.js';

const HUAWEI_AUTH_BASE = 'https://oauth-login.cloud.huawei.com/oauth2/v3';
const HUAWEI_API_BASE = 'https://api.cloud.huawei.com/health/v1';

/** 配置就绪（AppID + AppSecret 齐全） */
export function isHuaweiConfigured(): boolean {
  return Boolean(env.HUAWEI_APP_ID && env.HUAWEI_APP_SECRET);
}

/**
 * 生成 authorize URL（用户跳转华为 OAuth 授权）
 *
 * @param userId QM-WX userId（作 state，防 CSRF + Redis 关联）
 * @param callbackUrl 回调地址（含 state=userId）
 * @returns authorize URL（无凭据时返空串 + configured: false）
 */
export function generateHuaweiAuthUrl(userId: string, callbackUrl: string): {
  url: string;
  configured: boolean;
} {
  const appId = env.HUAWEI_APP_ID;
  const secret = env.HUAWEI_APP_SECRET;
  if (!appId || !secret) return { url: '', configured: false };

  // 华为运动健康 OAuth 2.0 standard scopes（按需扩展：activity_records / heart_rate / sleep / body_composition）
  const scope = 'openid profile';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appId,
    redirect_uri: callbackUrl,
    scope,
    state: userId,
    // 华为支持 access_type=offline 返 refresh_token
    access_type: 'offline',
  });
  return { url: `${HUAWEI_AUTH_BASE}/authorize?${params.toString()}`, configured: true };
}

/**
 * 用 authorization code 换 access_token + refresh_token
 *
 * POST https://oauth-login.cloud.huawei.com/oauth2/v3/token
 * Content-Type: application/x-www-form-urlencoded
 * body: grant_type=authorization_code + code + client_id + client_secret + redirect_uri
 */
export async function exchangeHuaweiCode(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 秒
  scope?: string;
  unionId?: string; // 华为用户 ID（openid 跨 app 唯一）
} | null> {
  const appId = env.HUAWEI_APP_ID;
  const secret = env.HUAWEI_APP_SECRET;
  if (!appId || !secret) return null;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: appId,
    client_secret: secret,
    redirect_uri: redirectUri,
  });

  try {
    const res = await fetch(`${HUAWEI_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      unionid?: string;
    };
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
      scope: data.scope,
      unionId: data.unionid,
    };
  } catch {
    return null;
  }
}

/**
 * 用 refresh_token 刷新 access_token
 */
export async function refreshHuaweiToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  const appId = env.HUAWEI_APP_ID;
  const secret = env.HUAWEI_APP_SECRET;
  if (!appId || !secret) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: appId,
    client_secret: secret,
  });

  try {
    const res = await fetch(`${HUAWEI_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token || !data.refresh_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in ?? 3600,
    };
  } catch {
    return null;
  }
}

// ===== Health API 拉取（凭据就绪后激活） =====

/** 华为活动 payload 标准化（参考华为 Health Open API 公开 schema） */
export interface ParsedHuaweiActivity {
  startTime: Date;
  durationSec: number | null;
  distanceMeters: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  sportType: string;
  vendorActivityId: string;
}

/**
 * 拉华为活动历史（accessToken + 日期范围）
 * GET https://api.cloud.huawei.com/health/v1/activity_records?start_date=...&end_date=...
 *
 * ⚠️ 端点路径 + schema 待华为文档核实（凭据切流时校准）
 */
export async function fetchHuaweiActivities(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<ParsedHuaweiActivity[] | null> {
  try {
    const res = await fetch(
      `${HUAWEI_API_BASE}/activity_records?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { activity_records?: Array<Record<string, unknown>> };
    return (data.activity_records ?? []).map((e) => parseHuaweiActivityRecord(e));
  } catch {
    return null;
  }
}

/** 华为活动字段映射（猜测，待文档核实） */
function parseHuaweiActivityRecord(e: Record<string, unknown>): ParsedHuaweiActivity {
  return {
    startTime: new Date(Number(e.start_time ?? Date.now() / 1000) * 1000),
    durationSec: e.duration != null ? Number(e.duration) : null,
    distanceMeters: e.distance != null ? Number(e.distance) : null,
    avgHr: e.avg_heart_rate != null ? Number(e.avg_heart_rate) : null,
    maxHr: e.max_heart_rate != null ? Number(e.max_heart_rate) : null,
    calories: e.calories != null ? Number(e.calories) : null,
    sportType: String(e.sport_type ?? 'running'),
    vendorActivityId: String(e.activity_id ?? ''),
  };
}

/**
 * 华为活动 → RawActivity 入库（与 garmin webhook 同模式）
 *
 * ⚠️ userId 映射：华为 unionId → QM-WX userId（via DeviceBinding vendor=huawei_oauth vendorUserId）
 *   凭据未切流时返 ok:false（数据不落库，避免污染）
 */
export async function upsertHuaweiActivity(
  userId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; count: number }> {
  const activities = await fetchHuaweiActivities(accessToken, startDate, endDate);
  if (!activities) return { ok: false, count: 0 };

  let count = 0;
  for (const act of activities) {
    if (!act.vendorActivityId || act.distanceMeters == null || act.distanceMeters <= 0) continue;
    try {
      await prisma.rawActivity.upsert({
        where: { vendor_vendorActivityId: { vendor: 'huawei', vendorActivityId: act.vendorActivityId } },
        create: {
          userId,
          vendor: 'huawei',
          vendorActivityId: act.vendorActivityId,
          type: act.sportType,
          startTime: act.startTime,
          durationSec: act.durationSec,
          distanceMeters: act.distanceMeters,
          avgHr: act.avgHr,
          maxHr: act.maxHr,
          raw: { source: 'huawei_oauth', calories: act.calories } as never,
          status: 'pending',
        },
        update: {}, // 幂等：已存在不覆盖
      });
      count++;
    } catch {
      // 单条失败不阻塞
    }
  }
  return { ok: true, count };
}