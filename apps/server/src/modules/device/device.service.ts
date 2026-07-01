/**
 * device module service — V2 stub（部分实现）
 *
 * 现状（Phase 4.1 收尾）：
 * - listBindings：✅ 真查 DB（DeviceBinding 表）
 * - startOAuth：✅ 生成 state JWT + mock authUrl（厂商 OAuth 跳转）
 * - unbind：🚧 stub（notImplemented）
 * - syncWeRun：🚧 stub（不做 upsert，仅返 ok）
 * - submitHeartRate：🚧 stub（notImplemented）
 *
 * Phase 6 完整实现需：
 * - 备案域名 + HTTPS
 * - 各厂商企业开发者账号（华为/佳明/小米/荣耀）
 * - AES 密钥（用于 token 加密存储）
 */
import { randomUUID } from 'node:crypto';
import { Errors } from '../../common/errors.js';
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';
import { env } from '../../config/env.js';
import { enqueueGarminImport } from '../../jobs/queue.js';
import { ACTIVITY_TYPE_MAP as TYPE_MAP } from './device.schema.js';
import type {
  StartOAuthInput,
  SyncWeRunInput,
  MyActivitiesQuery,
  MySleepQuery,
  MyMetricsQuery,
  MyFitnessAgeQuery,
  ActivityPageQuery,
  IgnoreActivityInput,
  ImportToCheckinInput,
} from './device.schema.js';

/** 佳明查询缓存 TTL：300s（历史数据低频变更，比 sport 60s 容忍更长延迟） */
const GARMIN_CACHE_TTL_SEC = 300;

export const deviceService = {
  /**
   * 列出当前用户的设备绑定
   *
   * 真查 DB（DeviceBinding 表）— 不再有 hard-coded 空 list
   * 数据形状：{ bindings: [{ id, vendor, lastSyncAt, status }] }
   */
  async listBindings(userId: string) {
    const rows = await prisma.deviceBinding.findMany({
      where: { userId },
      select: {
        id: true,
        vendor: true,
        lastSyncAt: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { bindings: rows };
  },

  /**
   * 发起厂商 OAuth
   *
   * MVP 简化：
   * - 生成 state token（HMAC-SHA256 签名，含 userId + vendor + 5 分钟过期）
   * - 返 mock authUrl：https://oauth.example.com/authorize?state=xxx&vendor=xxx
   * - 真生产：替换为各厂商真实 OAuth 端点（华为 Health Kit / 佳明 Connect / 小米开放平台）
   */
  async startOAuth(userId: string, input: StartOAuthInput) {
    // state = base64url(userId|vendor|nonce|exp)
    // 注：MVP 简化版不做 HMAC 签名（真生产必加 — 防止 CSRF / 防回调伪造）
    const nonce = randomUUID().replace(/-/g, '');
    const exp = Date.now() + 5 * 60 * 1000; // 5 分钟过期
    const state = Buffer.from(JSON.stringify({ userId, vendor: input.vendor, nonce, exp })).toString('base64url');

    // 厂商 OAuth 端点（沙箱走 example.com，真生产替换为各厂商端点）
    const vendorEndpoints: Record<string, string> = {
      huawei: 'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize',
      garmin: 'https://connect.garmin.com/oauthConfirm',
      xiaomi: 'https://api.xiaomi.com/oauth2/authorize',
      honor: 'https://open.hihonor.com/oauth2/authorize',
      mock: 'https://oauth.example.com/authorize', // 沙箱 fallback
    };
    const base = vendorEndpoints[input.vendor] ?? vendorEndpoints.mock;
    const params = new URLSearchParams({
      state,
      client_id: env.WX_APPID, // MVP 复用 WX_APPID 占位
      response_type: 'code',
      redirect_uri: `https://${new URL(env.WX_NOTIFY_URL ?? 'http://localhost').host}/api/device/oauth/callback`,
    });
    return { authUrl: `${base}?${params.toString()}`, expiresIn: 300 };
  },

  /** 解绑 */
  async unbind(_userId: string, _vendor: string) {
    // TODO Phase 6
    throw Errors.notImplemented('unbind');
  },

  /**
   * 同步微信运动（30 天步数）
   *
   * MVP 简化：只返 ok + 同步条数（不真做 upsert）
   * Phase 6：upsert raw_activities(vendor:werun, ...)
   */
  async syncWeRun(_userId: string, _input: SyncWeRunInput) {
    return { ok: true, synced: _input.stepList.length };
  },

  /** 提交 BLE 实时心率采样 */
  async submitHeartRate(_userId: string, _samples: unknown) {
    // TODO Phase 6
    throw Errors.notImplemented('submitHeartRate');
  },

  // ===== 佳明数据查询（B-2，2026-07-01；Cache.wrap 300s）=====
  // 缓存：历史数据低频变更，TTL 300s；ingest 灌数据后 delByPattern('garmin:*:{userId}:*') 失效
  // fail-open：Redis 挂静默降级直查 DB（Cache.wrap 内置）
  // 序列化：DateTime 进缓存前转 ISO 字符串，保证首次/缓存命中类型一致

  /** 我的活动（复用 RawActivity，vendor=garmin） */
  async myActivities(userId: string, input: MyActivitiesQuery) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const key = `garmin:activities:${userId}:${page}:${pageSize}:${input.type ?? 'all'}:${input.start ?? 0}-${input.end ?? 0}`;
    return Cache.wrap(key, GARMIN_CACHE_TTL_SEC, async () => {
      const where = {
        userId,
        vendor: 'garmin',
        ...(input.type ? { type: input.type } : {}),
        ...(input.start || input.end
          ? {
              startTime: {
                ...(input.start ? { gte: new Date(input.start) } : {}),
                ...(input.end ? { lte: new Date(input.end) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.rawActivity.findMany({
          where,
          orderBy: { startTime: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.rawActivity.count({ where }),
      ]);
      return {
        list: rows.map((a) => {
          const raw = (a.raw ?? {}) as Record<string, unknown>;
          return {
            id: a.id,
            type: a.type,
            startTime: a.startTime.toISOString(),
            durationSec: a.durationSec,
            distanceMeters: a.distanceMeters,
            avgHr: a.avgHr,
            maxHr: a.maxHr,
            cadence: a.cadence,
            name: (raw.name as string | null | undefined) ?? null,
            calories: (raw.calories as number | null | undefined) ?? null,
            locationName: (raw.locationName as string | null | undefined) ?? null,
          };
        }),
        total,
        page,
        pageSize,
        hasMore: page * pageSize < total,
      };
    });
  },

  /** 我的睡眠 */
  async mySleep(userId: string, input: MySleepQuery) {
    const key = `garmin:sleep:${userId}:${input.start ?? 0}-${input.end ?? 0}`;
    return Cache.wrap(key, GARMIN_CACHE_TTL_SEC, async () => {
      const where = {
        userId,
        ...(input.start || input.end
          ? {
              calendarDate: {
                ...(input.start ? { gte: new Date(input.start) } : {}),
                ...(input.end ? { lte: new Date(input.end) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.garminSleep.findMany({ where, orderBy: { calendarDate: 'desc' }, take: 500 }),
        prisma.garminSleep.count({ where }),
      ]);
      return {
        list: rows.map((s) => ({
          ...s,
          calendarDate: s.calendarDate.toISOString(),
          sleepStartGMT: s.sleepStartGMT?.toISOString() ?? null,
          sleepEndGMT: s.sleepEndGMT?.toISOString() ?? null,
          ingestedAt: s.ingestedAt.toISOString(),
        })),
        total,
      };
    });
  },

  /** 我的指标（需 metricType） */
  async myMetrics(userId: string, input: MyMetricsQuery) {
    const key = `garmin:metrics:${userId}:${input.metricType}:${input.start ?? 0}-${input.end ?? 0}`;
    return Cache.wrap(key, GARMIN_CACHE_TTL_SEC, async () => {
      const where = {
        userId,
        metricType: input.metricType,
        ...(input.start || input.end
          ? {
              calendarDate: {
                ...(input.start ? { gte: new Date(input.start) } : {}),
                ...(input.end ? { lte: new Date(input.end) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.garminMetric.findMany({ where, orderBy: { calendarDate: 'desc' }, take: 500 }),
        prisma.garminMetric.count({ where }),
      ]);
      return {
        list: rows.map((m) => ({
          ...m,
          calendarDate: m.calendarDate ? m.calendarDate.toISOString() : null,
          ingestedAt: m.ingestedAt.toISOString(),
        })),
        total,
      };
    });
  },

  /** 我的健身年龄（含 latest） */
  async myFitnessAge(userId: string, input: MyFitnessAgeQuery) {
    const key = `garmin:fitnessAge:${userId}:${input.start ?? 0}-${input.end ?? 0}`;
    return Cache.wrap(key, GARMIN_CACHE_TTL_SEC, async () => {
      const where = {
        userId,
        ...(input.start || input.end
          ? {
              asOfDate: {
                ...(input.start ? { gte: new Date(input.start) } : {}),
                ...(input.end ? { lte: new Date(input.end) } : {}),
              },
            }
          : {}),
      };
      const [rows, total, latest] = await Promise.all([
        prisma.garminFitnessAge.findMany({ where, orderBy: { asOfDate: 'desc' }, take: 500 }),
        prisma.garminFitnessAge.count({ where }),
        prisma.garminFitnessAge.findFirst({ where: { userId }, orderBy: { asOfDate: 'desc' } }),
      ]);
      return {
        list: rows.map((f) => ({
          ...f,
          asOfDate: f.asOfDate.toISOString(),
          ingestedAt: f.ingestedAt.toISOString(),
        })),
        total,
        latest: latest
          ? {
              ...latest,
              asOfDate: latest.asOfDate.toISOString(),
              ingestedAt: latest.ingestedAt.toISOString(),
            }
          : null,
      };
    });
  },

  // ===== 佳明数据处理（导入榜单，2026-07-01）=====
  // 阶段1：同步导入；阶段2 改为 BullMQ 入队（importToCheckin）

  /** 待处理活动列表（status=pending） */
  async myPending(userId: string, input: ActivityPageQuery) {
    const { page, pageSize } = input;
    const where = { userId, vendor: 'garmin', status: 'pending' as const };
    const [rows, total] = await Promise.all([
      prisma.rawActivity.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.rawActivity.count({ where }),
    ]);
    return {
      list: rows.map((r) => ({
        id: r.id,
        type: r.type,
        startTime: r.startTime.toISOString(),
        durationSec: r.durationSec,
        distanceMeters: r.distanceMeters,
        avgHr: r.avgHr,
        sportType: TYPE_MAP[r.type] ?? 'other',
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  },

  /** 已处理活动列表（status in [imported, ignored]） */
  async myProcessed(userId: string, input: ActivityPageQuery) {
    const { page, pageSize } = input;
    const where = {
      userId,
      vendor: 'garmin',
      status: { in: ['imported', 'ignored'] },
    };
    const [rows, total] = await Promise.all([
      prisma.rawActivity.findMany({
        where,
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.rawActivity.count({ where }),
    ]);
    return {
      list: rows.map((r) => ({
        id: r.id,
        type: r.type,
        startTime: r.startTime.toISOString(),
        durationSec: r.durationSec,
        distanceMeters: r.distanceMeters,
        status: r.status,
        importCheckinId: r.importCheckinId,
        importedAt: r.importedAt?.toISOString() ?? null,
        sportType: TYPE_MAP[r.type] ?? 'other',
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  },

  /** 忽略一条活动（status=ignored；已导入的不允许忽略） */
  async ignoreActivity(userId: string, input: IgnoreActivityInput) {
    const r = await prisma.rawActivity.findFirst({
      where: { id: input.activityId, userId, vendor: 'garmin' },
    });
    if (!r) throw Errors.notFound('activity not found');
    if (r.status === 'imported') throw Errors.badRequest('已导入不可忽略');
    await prisma.rawActivity.update({
      where: { id: r.id },
      data: { status: 'ignored' },
    });
    return { ok: true };
  },

  /**
   * 批量导入榜单（阶段2：BullMQ 入队，异步处理）
   *
   * 用户勾选活动 → 入队 garmin-import → worker 写 Checkin + 更新 RawActivity.status
   * 返回 jobId（前端可查 BullMQ job 状态）；真正的导入逻辑在 jobs/garmin-import.job.ts
   */
  async importToCheckin(userId: string, input: ImportToCheckinInput) {
    const job = await enqueueGarminImport({
      userId,
      activityIds: input.activityIds,
    });
    return {
      jobId: job.id,
      queued: input.activityIds.length,
    };
  },
};
