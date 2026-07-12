/**
 * Terra API 客户端（V0.1.130 COROS 聚合）
 *
 * Terra 是第三方健康数据聚合服务，代理 COROS 官方数据（官方 API 审核制不公开）。
 * 流程：用户经 Terra widget 授权 → COROS 同步时 Terra webhook PUSH → 落库
 *
 * 配置：TERRA_API_KEY / TERRA_DEV_ID / TERRA_WEBHOOK_SECRET（env，缺省 stub）
 * 文档：https://docs.tryterra.co/
 */
import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';

const TERRA_BASE = 'https://api.tryterra.co/v2';

/** 生成 Terra widget 授权 URL（用户跳转授权 COROS 账号；未配置 devId 返空串） */
export function generateTerraAuthUrl(userId: string): string {
  const devId = env.TERRA_DEV_ID;
  if (!devId) return '';
  return `https://tryterra.co/scan/${devId}?reference_id=${encodeURIComponent(userId)}&resource=coros`;
}

/** 配置就绪（devId + apiKey + webhookSecret 齐全） */
export function isTerraConfigured(): boolean {
  return Boolean(env.TERRA_DEV_ID && env.TERRA_API_KEY && env.TERRA_WEBHOOK_SECRET);
}

/** 验证 Terra webhook 签名（Terra POST 时带 xterra-signature 头，HMAC-SHA256） */
export function verifyTerraSignature(rawBody: string, signature: string): boolean {
  const secret = env.TERRA_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signature;
}

/** Terra activity payload 解析结果 */
export interface ParsedActivity {
  startTime: Date;
  durationSec: number | null;
  distanceMeters: number | null;
  avgHr: number | null;
  maxHr: number | null;
  cadence: number | null;
  type: string;
}

/**
 * 从 Terra activity payload 提取 RawActivity 字段（标准化 JSON → DB 字段）
 *
 * Terra payload 6 data types：metadata / distance_data / active_durations_data /
 * heart_rate_data / movement_data / calories_data
 */
export function parseTerraActivity(payload: Record<string, unknown>): ParsedActivity | null {
  const metadata = payload.metadata as { start_time?: string; sport?: string } | undefined;
  if (!metadata?.start_time) return null;

  const startTime = new Date(metadata.start_time);
  const durationSec =
    (
      payload.active_durations_data as
        | { active_durations_data?: { duration?: number } }
        | undefined
    )?.active_durations_data?.duration ?? null;
  const distanceMeters =
    (
      payload.distance_data as
        | { distance_data?: { distance_metadata?: { value?: number } } }
        | undefined
    )?.distance_data?.distance_metadata?.value ?? null;
  const hrSummary = (
    payload.heart_rate_data as
      | { heart_rate_data?: { summary?: { avg_hr?: number; max_hr?: number } } }
      | undefined
  )?.heart_rate_data?.summary;
  const cadence =
    (
      payload.movement_data as
        | { movement_data?: { summary?: { avg_cadence?: number } } }
        | undefined
    )?.movement_data?.summary?.avg_cadence ?? null;

  return {
    startTime,
    durationSec: durationSec != null ? Math.round(durationSec) : null,
    distanceMeters: distanceMeters != null ? Math.round(distanceMeters) : null,
    avgHr: hrSummary?.avg_hr ?? null,
    maxHr: hrSummary?.max_hr ?? null,
    cadence: cadence ?? null,
    type: metadata.sport ?? 'running',
  };
}

/** Terra REST 拉历史 activity（webhook 补充；未配置返 null） */
export async function fetchTerraActivity(
  terraUserId: string,
  start: string,
  end: string,
): Promise<unknown[] | null> {
  const apiKey = env.TERRA_API_KEY;
  if (!apiKey) return null;
  const url = `${TERRA_BASE}/activity?user_id=${encodeURIComponent(terraUserId)}&start_date=${start}&end_date=${end}`;
  const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as { activity?: unknown[] };
  return data.activity ?? [];
}
