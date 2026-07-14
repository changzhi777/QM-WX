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
import { randomUUID, createDecipheriv } from 'node:crypto';
import AdmZip from 'adm-zip';
import unzipper from 'unzipper';
import FitParser from 'fit-file-parser';
import {
  generateTerraAuthUrl,
  generateGarminAuthUrl,
  isTerraConfigured,
  verifyTerraSignature,
  parseTerraActivity,
  fetchTerraActivity,
} from './terra-client.js';
import { parse as parseCsv } from 'csv-parse/sync';
import { Errors } from '../../common/errors.js';
import { prisma } from '../../infra/prisma.js';
import type { Prisma } from '@prisma/client';
import { redis } from '../../infra/redis.js';
import { Cache } from '../../infra/cache.js';
import { env } from '../../config/env.js';
import { enqueueGarminImport } from '../../jobs/queue.js';
import { ACTIVITY_TYPE_MAP as TYPE_MAP } from './device.schema.js';
import type {
  StartOAuthInput,
  SyncWeRunInput,
  MyWeRunQuery,
  BindBleDeviceInput,
  SubmitHeartRateInput,
  SubmitSpO2Input,
  MyHealthHistoryQuery,
  SubmitBodyCompositionInput,
  MyActivitiesQuery,
  MySleepQuery,
  MyMetricsQuery,
  MyFitnessAgeQuery,
  ActivityPageQuery,
  IgnoreActivityInput,
  ImportToCheckinInput,
} from './device.schema.js';
import { DEVICE_BRANDS } from '@qm-wx/shared';

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

  /**
   * 解绑（V0.1.25 实现：删 DeviceBinding）
   *
   * 蓝牙绑定额外清除实时心率缓存
   */
  async unbind(userId: string, vendor: string) {
    const binding = await prisma.deviceBinding.findFirst({
      where: { userId, vendor },
    });
    if (!binding) throw Errors.notFound('binding not found');
    await prisma.deviceBinding.delete({ where: { id: binding.id } });
    if (vendor === 'ble') {
      await Cache.del(`ble:hr:${userId}`);
    }
    return { ok: true };
  },

  /**
   * 同步微信运动（30 天步数）
   *
   * MVP 简化：只返 ok + 同步条数（不真做 upsert）
   * Phase 6：upsert raw_activities(vendor:werun, ...)
   */
  /**
   * 同步微信运动步数（V0.1.43 实现，替 stub）
   *
   * 前端 wx.getWeRunData → encryptedData + iv → 后端用 session_key AES 解密 → stepInfoList
   * timestamp 毫秒 → CN 时区 date，同日聚合取 max step
   * upsert by userId+date（同一日取 max step 防回退）
   */
  async syncWeRun(userId: string, input: SyncWeRunInput) {
    // 1. 查 user.openid
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { openid: true } });
    if (!user) throw Errors.notFound('user not found');

    // 2. get session_key from Redis（code2Session 时缓存，TTL 7000s）
    const sessionKey = await redis.get(`wx:session:${user.openid}`);
    if (!sessionKey) throw Errors.badRequest('session_key 已过期，请重新进入小程序');

    // 3. AES 解密 encryptedData（微信 WXBizDataCrypt：AES-128-CBC）
    const decrypted = decryptWeRunData(sessionKey, input.encryptedData, input.iv);
    if (!decrypted?.stepInfoList?.length) throw Errors.badRequest('微信运动数据解密失败');
    const stepList = decrypted.stepInfoList;

    // 4. timestamp → CN 时区 date，同日取 max step
    const dayMap = new Map<string, number>();
    for (const item of stepList) {
      const date = cnDateFromTs(item.timestamp);
      const prev = dayMap.get(date) ?? 0;
      if (item.step > prev) dayMap.set(date, item.step);
    }

    // 5. upsert（按 userId+date unique，取 max 防回退）
    let synced = 0;
    for (const [date, step] of dayMap) {
      const existing = await prisma.weRunRecord.findUnique({ where: { userId_date: { userId, date } } });
      if (!existing || step > existing.step) {
        await prisma.weRunRecord.upsert({
          where: { userId_date: { userId, date } },
          create: { userId, date, step },
          update: { step },
        });
      }
      synced++;
    }

    return { synced, days: dayMap.size };
  },

  /**
   * 我的微信运动历史（V0.1.43）
   *
   * 按日期范围返步数列表 + km 估算（步数 × 0.7m）+ 汇总
   * Cache 60s（syncWeRun 后失效）
   */
  async myWeRun(userId: string, input: MyWeRunQuery) {
    const key = `werun:${userId}:${input.startDate}:${input.endDate}`;
    return Cache.wrap(key, 60, async () => {
      const records = await prisma.weRunRecord.findMany({
        where: { userId, date: { gte: input.startDate, lte: input.endDate } },
        orderBy: { date: 'asc' },
      });
      const totalSteps = records.reduce((s, r) => s + r.step, 0);
      const STEP_TO_KM = 0.0007; // 平均步幅 0.7m
      return {
        records: records.map((r) => ({
          date: r.date,
          step: r.step,
          km: Math.round(r.step * STEP_TO_KM * 100) / 100,
        })),
        totalSteps,
        totalKm: Math.round(totalSteps * STEP_TO_KM * 100) / 100,
        days: records.length,
      };
    });
  },

  /**
   * 提交实时心率（蓝牙 BLE 心率服务 0x180D notify 回调，V0.1.25；V0.1.43 加持久化）
   *
   * 双写：
   * - Redis 缓存 ble:hr:{userId} TTL 1h（实时，供 sport 打卡页秒级展示）
   * - HeartRateRecord createMany（历史，供 myHealthHistory / myTodayHealth latest 查询）
   *
   * fail-open：Cache.set 静默失败不阻塞；createMany 失败抛错（历史数据重要）
   * 写后失效 myTodayHealth 缓存（latestHr 变化）
   */
  async submitHeartRate(userId: string, input: SubmitHeartRateInput) {
    const latest = input.samples[input.samples.length - 1];
    await Cache.set({ key: `ble:hr:${userId}`, ttlSec: 3600, value: latest });
    await prisma.heartRateRecord.createMany({
      data: input.samples.map((s) => ({
        userId,
        value: s.hr,
        timestamp: new Date(s.ts),
        source: 'ble',
      })),
    });
    await Cache.del(`garmin:today:${userId}:${todayRangeCN().dateStr}`);
    return { ok: true, count: input.samples.length, latest: latest.hr };
  },

  /**
   * 提交血氧（BLE 0x1822 / 0x2A5F spot-check 测量结果，V0.1.43）
   *
   * 单次测量值落 SpO2Record；myTodayHealth 取今日 latest
   */
  async submitSpO2(userId: string, input: SubmitSpO2Input) {
    const record = await prisma.spO2Record.create({
      data: {
        userId,
        value: input.value,
        timestamp: input.ts ? new Date(input.ts) : new Date(),
      },
    });
    await Cache.del(`garmin:today:${userId}:${todayRangeCN().dateStr}`);
    return { ok: true, value: record.value, timestamp: record.timestamp.toISOString() };
  },

  /**
   * 提交体脂秤数据（V0.1.124 BLE 小米体脂秤）
   * 前端解析 BLE ArrayBuffer → 算体成分 → 提交落库
   */
  async submitBodyComposition(userId: string, input: SubmitBodyCompositionInput) {
    const record = await prisma.bodyCompositionRecord.create({
      data: {
        userId,
        weight: input.weight,
        bodyFat: input.bodyFat ?? null,
        bmi: input.bmi ?? null,
        muscle: input.muscle ?? null,
        bone: input.bone ?? null,
        water: input.water ?? null,
        visceralFat: input.visceralFat ?? null,
        impedance: input.impedance ?? null,
        timestamp: input.ts ? new Date(input.ts) : new Date(),
      },
    });
    return { ok: true, id: record.id, timestamp: record.timestamp.toISOString() };
  },

  /**
   * 健康历史（心率/血氧，V0.1.43）
   *
   * 按 type + dateRange 分页查询；type 决定查 HeartRateRecord 还是 SpO2Record
   */
  async myHealthHistory(userId: string, input: MyHealthHistoryQuery) {
    // V0.1.43 sleep 类型：按 date 字符串查 SleepRecord（字段不同，单独处理）
    if (input.type === 'sleep') {
      const startDate = input.start?.slice(0, 10);
      const endDate = input.end?.slice(0, 10);
      const whereSleep = {
        userId,
        ...(startDate || endDate
          ? { date: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } }
          : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.sleepRecord.findMany({
          where: whereSleep,
          orderBy: { date: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        prisma.sleepRecord.count({ where: whereSleep }),
      ]);
      return {
        type: 'sleep',
        list: rows.map((r) => ({
          id: r.id,
          value: r.durationSeconds ? Math.round((r.durationSeconds / 3600) * 10) / 10 : 0,
          timestamp: `${r.date}T00:00:00.000Z`,
          score: r.score,
          deepHours: r.deepSeconds ? Math.round((r.deepSeconds / 3600) * 10) / 10 : null,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        hasMore: input.page * input.pageSize < total,
      };
    }
    const where = {
      userId,
      ...(input.start || input.end
        ? {
            timestamp: {
              ...(input.start ? { gte: new Date(input.start) } : {}),
              ...(input.end ? { lte: new Date(input.end) } : {}),
            },
          }
        : {}),
    };
    // V0.1.125 body_composition 类型：查 BodyCompositionRecord（体重/体脂/肌肉等）
    if (input.type === 'body_composition') {
      const [rows, total] = await Promise.all([
        prisma.bodyCompositionRecord.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        prisma.bodyCompositionRecord.count({ where }),
      ]);
      return {
        type: 'body_composition',
        list: rows.map((r) => ({
          id: r.id,
          weight: r.weight,
          bodyFat: r.bodyFat,
          bmi: r.bmi,
          muscle: r.muscle,
          bone: r.bone,
          water: r.water,
          visceralFat: r.visceralFat,
          impedance: r.impedance,
          timestamp: r.timestamp.toISOString(),
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        hasMore: input.page * input.pageSize < total,
      };
    }
    const isHr = input.type === 'hr';
    const [rows, total] = await Promise.all([
      isHr
        ? prisma.heartRateRecord.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          })
        : prisma.spO2Record.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip: (input.page - 1) * input.pageSize,
            take: input.pageSize,
          }),
      isHr ? prisma.heartRateRecord.count({ where }) : prisma.spO2Record.count({ where }),
    ]);
    return {
      type: input.type,
      list: rows.map((r) => ({ id: r.id, value: r.value, timestamp: r.timestamp.toISOString() })),
      total,
      page: input.page,
      pageSize: input.pageSize,
      hasMore: input.page * input.pageSize < total,
    };
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

  /**
   * 今日健康看板（V0.1.25，参考图 2774）
   *
   * 聚合 4 类佳明数据 → 一次返回，减少前端多次 round-trip：
   * - 睡眠：GarminSleep latest（总时长 + 深睡/浅睡/REM + 评分）
   * - 健身年龄：GarminFitnessAge latest（生理年龄 + VO2Max + 静息心率 + BMI）
   * - 训练指标：GarminMetric 按 metricType 取 latest（training_readiness / endurance_score / hill_score）
   * - 今日活动：RawActivity 今日汇总（次数 + 距离 + 时长 + 热量）
   *
   * 无数据源指标（步数/血氧/血压/体重/血糖）放入 unavailable，前端显示"连接设备后查看"占位
   *
   * 缓存：Cache.wrap + 300s TTL + key 含 userId/今日日期（缓存热路径 14→15）
   */
  async myTodayHealth(userId: string) {
    const { start, end, dateStr } = todayRangeCN();
    const key = `garmin:today:${userId}:${dateStr}`;
    return Cache.wrap(key, GARMIN_CACHE_TTL_SEC, async () => {
      const [sleepLatest, fitnessAgeLatest, metrics, todayActivities, latestHrRow, latestSpO2Row, todayWeRun, latestMiSleepRow] = await Promise.all([
        prisma.garminSleep.findFirst({ where: { userId }, orderBy: { calendarDate: 'desc' } }),
        prisma.garminFitnessAge.findFirst({ where: { userId }, orderBy: { asOfDate: 'desc' } }),
        prisma.garminMetric.findMany({
          where: {
            userId,
            metricType: { in: ['training_readiness', 'endurance_score', 'hill_score'] },
          },
          orderBy: { calendarDate: 'desc' },
        }),
        prisma.rawActivity.findMany({
          where: { userId, vendor: 'garmin', startTime: { gte: start, lt: end } },
        }),
        // V0.1.43 BLE 心率/血氧今日 latest + 微信运动今日步数
        prisma.heartRateRecord.findFirst({
          where: { userId, timestamp: { gte: start, lt: end } },
          orderBy: { timestamp: 'desc' },
        }),
        prisma.spO2Record.findFirst({
          where: { userId, timestamp: { gte: start, lt: end } },
          orderBy: { timestamp: 'desc' },
        }),
        prisma.weRunRecord.findUnique({ where: { userId_date: { userId, date: dateStr } } }),
        // V0.1.43 小米睡眠（SleepRecord，从小米数据包导入，今日）
        prisma.sleepRecord.findFirst({ where: { userId, date: dateStr } }),
      ]);

      // 各 metricType 取 latest（已按日期 desc，首次出现即最新）
      const metricMap = new Map<string, number | null>();
      for (const m of metrics) {
        if (!metricMap.has(m.metricType)) metricMap.set(m.metricType, m.value);
      }

      // 今日活动汇总（距离/时长/热量）
      let totalDistanceM = 0;
      let totalDurationSec = 0;
      let totalCalories = 0;
      for (const a of todayActivities) {
        totalDistanceM += a.distanceMeters ?? 0;
        totalDurationSec += a.durationSec ?? 0;
        const raw = (a.raw ?? {}) as Record<string, unknown>;
        if (typeof raw.calories === 'number') totalCalories += raw.calories;
      }

      return {
        date: dateStr,
        // V0.1.43 BLE 心率/血氧 + 微信运动步数（首页今日健康卡数据源）
        hr: latestHrRow
          ? { value: latestHrRow.value, timestamp: latestHrRow.timestamp.toISOString() }
          : null,
        spo2: latestSpO2Row
          ? { value: latestSpO2Row.value, timestamp: latestSpO2Row.timestamp.toISOString() }
          : null,
        steps: todayWeRun ? { value: todayWeRun.step, date: todayWeRun.date } : null,
        // V0.1.43 小米睡眠（SleepRecord，小米数据包导入，今日；与佳明 sleep 字段区分）
        sleepXiaomi: latestMiSleepRow
          ? {
              durationHours: latestMiSleepRow.durationSeconds
                ? secsToHours(latestMiSleepRow.durationSeconds)
                : null,
              deepHours: latestMiSleepRow.deepSeconds ? secsToHours(latestMiSleepRow.deepSeconds) : null,
              lightHours: latestMiSleepRow.lightSeconds ? secsToHours(latestMiSleepRow.lightSeconds) : null,
              score: latestMiSleepRow.score,
              bedtime: latestMiSleepRow.bedtime?.toISOString() ?? null,
              wakeTime: latestMiSleepRow.wakeTime?.toISOString() ?? null,
              date: latestMiSleepRow.date,
            }
          : null,
        sleep: sleepLatest
          ? {
              durationHours: sleepDurationHours(sleepLatest),
              deepHours: secsToHours(sleepLatest.deepSleepSeconds),
              lightHours: secsToHours(sleepLatest.lightSleepSeconds),
              remHours: secsToHours(sleepLatest.remSleepSeconds),
              score: extractSleepScore(sleepLatest.sleepScores),
              calendarDate: sleepLatest.calendarDate.toISOString(),
            }
          : null,
        fitnessAge: fitnessAgeLatest
          ? {
              chronologicalAge: fitnessAgeLatest.chronologicalAge,
              currentBioAge: fitnessAgeLatest.currentBioAge,
              vo2Max: fitnessAgeLatest.vo2Max,
              rhr: fitnessAgeLatest.rhr,
              bmi: fitnessAgeLatest.bmi,
              asOfDate: fitnessAgeLatest.asOfDate.toISOString(),
            }
          : null,
        metrics: {
          trainingReadiness: metricMap.get('training_readiness') ?? null,
          enduranceScore: metricMap.get('endurance_score') ?? null,
          hillScore: metricMap.get('hill_score') ?? null,
        },
        todayActivity:
          todayActivities.length > 0
            ? {
                count: todayActivities.length,
                totalDistanceKm: round2(totalDistanceM / 1000),
                totalDurationMin: Math.round(totalDurationSec / 60),
                totalCalories: Math.round(totalCalories),
              }
            : null,
        // 佳明数据源不支持的指标 — 前端显示"连接设备后查看"占位
        // V0.1.43：steps/spo2 已接入（BLE/微信运动），从未可用列表移除
        unavailable: ['bloodPressure', 'weight', 'bloodGlucose'],
      };
    });
  },

  // ===== 设备绑定中心（V0.1.25，参考图 2770）=====

  /**
   * 我的设备绑定（品牌列表 + 已绑设备）
   *
   * 返回 DEVICE_BRANDS（shared 常量，前后端共用）+ 用户 DeviceBinding 列表。
   * 佳明特殊：数据由脚本灌入 RawActivity（未走 DeviceBinding），
   * 故基于 RawActivity 计数自动判定"已连接（数据已导入）"。
   */
  async myBindings(userId: string) {
    const [bindings, garminActivityCount] = await Promise.all([
      prisma.deviceBinding.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.rawActivity.count({ where: { userId, vendor: 'garmin' } }),
    ]);

    return {
      brands: DEVICE_BRANDS,
      bindings: bindings.map((b) => ({
        id: b.id,
        vendor: b.vendor,
        // BLE 类 vendor（ble/garmin/xiaomi/coros）：设备名存 accessTokenEnc（复用字段，零 schema 改）；oauth: vendorUserId
        deviceName:
          b.vendor === 'ble' || b.vendor === 'garmin' || b.vendor === 'xiaomi' || b.vendor === 'coros'
            ? b.accessTokenEnc ?? '蓝牙设备'
            : b.vendorUserId ?? b.vendor,
        status: b.status,
        lastSyncAt: b.lastSyncAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      })),
      // V0.1.33：佳明 BLE 绑定优先展示，OAuth 数据降级（前端按两字段判定）
      // 优化：从 bindings 过滤 garmin，省一次 findUnique DB round-trip（findMany 已含全部）
      garminBleBound: bindings.some((b) => b.vendor === 'garmin'),
      garminAutoConnected: garminActivityCount > 0,
      garminActivityCount,
    };
  },

  /**
   * 绑定蓝牙设备（微信 createBLEConnection 成功后调）
   *
   * upsert DeviceBinding（@@unique([userId, vendor])，复绑覆盖旧值）：
   * - vendor = 'ble'
   * - vendorUserId = 微信 bleDeviceId
   * - accessTokenEnc = 设备名（复用字段存展示名，零 schema 改）
   * - scopes = 支持的 BLE 服务 UUID 列表
   */
  async bindBleDevice(userId: string, input: BindBleDeviceInput) {
    // V0.1.33：vendor 品牌化（garmin/xiaomi 按品牌 upsert，可同时绑多设备；ble 兼容旧通用）
    // 兜底 'ble'：route 层 Zod default 已处理，service 层再加一道防直接调用（如测试/内部调用）
    const vendor = input.vendor ?? 'ble';
    const binding = await prisma.deviceBinding.upsert({
      where: { userId_vendor: { userId, vendor } },
      create: {
        userId,
        vendor,
        vendorUserId: input.deviceId,
        accessTokenEnc: input.name,
        scopes: input.services,
        status: 'active',
        lastSyncAt: new Date(),
      },
      update: {
        vendorUserId: input.deviceId,
        accessTokenEnc: input.name,
        scopes: input.services,
        status: 'active',
        lastSyncAt: new Date(),
      },
    });
    return {
      id: binding.id,
      vendor: binding.vendor,
      deviceName: input.name,
      status: binding.status,
    };
  },

  /**
   * 导入 COROS FIT 文件（V0.1.129）
   *
   * COROS app 导出活动 FIT → 小程序上传 → fit-file-parser 解析 → RawActivity upsert
   * 复用 RawActivity（vendor='coros'），后续走 importToCheckin 进统一榜（同 garmin 范式）
   */
  async importCorosFit(userId: string, buffer: Buffer): Promise<{
    id: string;
    type: string;
    startTime: string;
    durationSec: number | null;
    distanceMeters: number | null;
    created: boolean;
  }> {
    const fitParser = new FitParser({ force: true, mode: 'list' });
    let data: { sessions?: Array<Record<string, unknown>> };
    try {
      data = (await fitParser.parseAsync(buffer as unknown as ArrayBuffer)) as {
        sessions?: Array<Record<string, unknown>>;
      };
    } catch {
      throw Errors.badRequest('FIT 文件解析失败');
    }
    const session = data.sessions?.[0];
    if (!session) throw Errors.badRequest('FIT 无 session 数据');

    const startRaw = session.start_time ?? session.timestamp_created;
    const startTime = startRaw instanceof Date ? startRaw : new Date(String(startRaw));
    const durationSec = Number(session.total_timer_time ?? session.total_elapsed_time ?? 0) || null;
    const distanceMeters = session.total_distance != null ? Number(session.total_distance) : null;
    const avgHr = (session.avg_heart_rate as number | undefined) ?? null;
    const maxHr = (session.max_heart_rate as number | undefined) ?? null;
    const cadence =
      (session.avg_cadence as number | undefined) ?? (session.total_strides as number | undefined) ?? null;
    const sport = String(session.sport ?? 'running');
    const type = TYPE_MAP[sport] || sport;

    const rawJson = toPureJson(data);
    const raw = await upsertCorosRawActivity(
      userId,
      { startTime, durationSec, distanceMeters, avgHr, maxHr, cadence, type },
      rawJson,
    );

    return {
      id: raw.id,
      type: raw.type,
      startTime: raw.startTime.toISOString(),
      durationSec: raw.durationSec,
      distanceMeters: raw.distanceMeters,
      created: raw.status === 'pending',
    };
  },

  /**
   * 生成 Terra 授权 URL（V0.1.130 COROS 聚合）
   *
   * 用户跳 Terra widget 授权 COROS 账号 → 同步时 webhook PUSH 数据。
   * 未配置 TERRA_DEV_ID 返空 url + configured=false（前端提示敬请期待）。
   */
  async corosAuthUrl(userId: string): Promise<{ url: string; configured: boolean }> {
    return { url: generateTerraAuthUrl(userId), configured: isTerraConfigured() };
  },

  /** V0.1.146 D 路线：Garmin Terra 授权 URL（复用 COROS 通道，resource=garmin） */
  async garminAuthUrl(userId: string): Promise<{ url: string; configured: boolean }> {
    return { url: generateGarminAuthUrl(userId), configured: isTerraConfigured() };
  },

  /**
   * Terra webhook 接收（V0.1.130，public 路由无 JWT，用 Terra 签名验证）
   *
   * 验签 + payload 落 CorosRawEvent + activity 解析到 RawActivity（vendor=coros）
   * reference 字段 = generateTerraAuthUrl 传的 reference_id（= userId）
   */
  async terraWebhook(rawBody: string, signature: string): Promise<{ ok: boolean; saved: boolean }> {
    if (!verifyTerraSignature(rawBody, signature)) {
      throw Errors.unauthorized();
    }
    const payload = JSON.parse(rawBody) as {
      user_id?: string;
      type?: string;
      data?: Record<string, unknown>;
      reference?: string;
    };
    const userId = payload.reference;
    if (!userId) return { ok: true, saved: false }; // 无 reference，忽略

    const terraUserId = payload.user_id ?? '';
    const type = (payload.type ?? 'activity').replace('_data', '').replace('data', '');

    // activity → 解析到 RawActivity；daily/sleep 暂存原始 payload 待后续
    let processed = type !== 'activity';
    if (type === 'activity' && payload.data) {
      const parsed = parseTerraActivity(payload.data);
      if (parsed) {
        await upsertCorosRawActivity(userId, parsed, toPureJson(payload));
        processed = true;
      }
    }

    await prisma.corosRawEvent.create({
      data: {
        userId,
        terraUserId,
        type,
        payload: toPureJson(payload),
        processed,
      },
    });

    return { ok: true, saved: true };
  },

  /**
   * Terra REST 拉历史 activity（V0.1.130，webhook 补充，手动触发）
   * 需先 webhook 授权（CorosRawEvent 有 terraUserId 记录）
   */
  async syncFromTerra(
    userId: string,
    input: { start: string; end: string },
  ): Promise<{ ok: boolean; count: number; msg?: string }> {
    const latest = await prisma.corosRawEvent.findFirst({
      where: { userId },
      orderBy: { receivedAt: 'desc' },
    });
    if (!latest) return { ok: false, count: 0, msg: '未授权 Terra（需先 webhook 授权）' };

    const activities = await fetchTerraActivity(latest.terraUserId, input.start, input.end);
    if (!activities) return { ok: false, count: 0, msg: 'Terra 未配置 API key' };

    let count = 0;
    for (const act of activities) {
      const parsed = parseTerraActivity(act as Record<string, unknown>);
      if (!parsed) continue;
      await upsertCorosRawActivity(userId, parsed, toPureJson(act));
      count++;
    }
    return { ok: true, count };
  },

  /**
   * 解析小米 ZIP 结构（V0.1.43 阶段 1：返回文件树 + 文本预览，不做入库）
   *
   * 用于确认小米隐私中心导出格式。阶段 2 根据真实格式接解析 + 入库。
   */
  async parseXiaomiZipStructure(buffer: Buffer): Promise<{
    files: { name: string; size: number; isDirectory: boolean; preview?: string }[];
    count: number;
  }> {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    return {
      files: entries.map((e) => {
        const lower = e.entryName.toLowerCase();
        const isText =
          lower.endsWith('.json') ||
          lower.endsWith('.csv') ||
          lower.endsWith('.txt') ||
          lower.endsWith('.xml') ||
          lower.endsWith('.tcx');
        return {
          name: e.entryName,
          size: e.header.size,
          isDirectory: e.isDirectory,
          preview:
            !e.isDirectory && isText ? zip.readAsText(e).slice(0, 500) : undefined,
        };
      }),
      count: entries.length,
    };
  },

  /**
   * 导入小米数据包 ZIP（V0.1.43 阶段 2：解析 CSV + 入库 4 表）
   *
   * 小米隐私中心导出格式（已摸清）：
   * - 全 CSV（不是 JSON），文件名 *_hlth_center_aggregated_fitness_data.csv（每日聚合，最有价值）
   * - 表头：Uid,Sid,Tag,Key,Time,Value,UpdateTime
   * - Time = Unix 秒；Value = JSON 字符串（嵌套，含转义 ""）
   *
   * 入库映射：
   * - heart_rate aggregated → latest_hr.bpm + time → HeartRateRecord（逐条）
   * - spo2 aggregated → latest_spo2.spo2 + time → SpO2Record（逐条）
   * - sleep aggregated → SleepRecord（by userId+date upsert，duration 单位分钟→秒 ×60）
   * - steps aggregated → WeRunRecord（by userId+date upsert，补充每日步数）
   * - stress/calories/weight → 暂不入（YAGNI，后续按需）
   */
  async importXiaomiZip(userId: string, buffer: Buffer, password = ''): Promise<{
    hr: number;
    spo2: number;
    sleep: number;
    steps: number;
  }> {
    // unzipper 解压（支持 ZipCrypto + AES；adm-zip 解密有 bug，换 unzipper）
    const directory = await unzipper.Open.buffer(buffer);
    const aggFile = directory.files.find(
      (f) => f.path.includes('hlth_center_aggregated_fitness_data') && f.path.endsWith('.csv'),
    );
    if (!aggFile) throw Errors.badRequest('ZIP 内未找到 hlth_center_aggregated_fitness_data.csv');

    const csvText = (await aggFile.buffer(password)).toString('utf8'); // 小米 ZIP 加密，传密码解压
    const records = parseCsv(csvText, { columns: true, skip_empty_lines: true }) as Array<{
      Key: string;
      Time: string;
      Value: string;
    }>;

    const hrSamples: { value: number; timestamp: Date }[] = [];
    const spo2Samples: { value: number; timestamp: Date }[] = [];
    const sleepUpserts: { date: string; data: Record<string, unknown> }[] = [];
    const stepUpserts: { date: string; step: number }[] = [];

    for (const r of records) {
      const time = Number(r.Time); // Unix 秒
      let value: Record<string, unknown>;
      try {
        value = JSON.parse(r.Value);
      } catch {
        continue; // Value 非法 JSON，跳过
      }
      const date = cnDateFromTs(time); // CN 时区 YYYY-MM-DD

      if (r.Key === 'heart_rate') {
        const latest = value.latest_hr as { bpm?: number; time?: number } | undefined;
        if (latest?.bpm && latest.time) {
          hrSamples.push({ value: latest.bpm, timestamp: new Date(latest.time * 1000) });
        }
      } else if (r.Key === 'spo2') {
        const latest = value.latest_spo2 as { spo2?: number; time?: number } | undefined;
        if (latest?.spo2 && latest.time) {
          spo2Samples.push({ value: latest.spo2, timestamp: new Date(latest.time * 1000) });
        }
      } else if (r.Key === 'sleep') {
        const seg = (value.segment_details as Array<{ bedtime?: number; wake_up_time?: number }> | undefined)?.[0];
        const min = (n: number | undefined): number | null => (n != null ? n * 60 : null); // 分钟→秒
        sleepUpserts.push({
          date,
          data: {
            bedtime: seg?.bedtime ? new Date(seg.bedtime * 1000) : null,
            wakeTime: seg?.wake_up_time ? new Date(seg.wake_up_time * 1000) : null,
            durationSeconds: min(value.total_duration as number | undefined),
            deepSeconds: min(value.sleep_deep_duration as number | undefined),
            lightSeconds: min(value.sleep_light_duration as number | undefined),
            remSeconds: null,
            awakeSeconds: min(value.sleep_awake_duration as number | undefined),
            score: (value.sleep_score as number | undefined) ?? null,
          },
        });
      } else if (r.Key === 'steps') {
        stepUpserts.push({ date, step: (value.steps as number) ?? 0 });
      }
    }

    // 批量入库（心率/血氧 createMany，睡眠/步数 upsert by userId+date）
    if (hrSamples.length) {
      await prisma.heartRateRecord.createMany({
        data: hrSamples.map((s) => ({ userId, value: s.value, timestamp: s.timestamp, source: 'xiaomi' })),
      });
    }
    if (spo2Samples.length) {
      await prisma.spO2Record.createMany({
        data: spo2Samples.map((s) => ({ userId, value: s.value, timestamp: s.timestamp })),
      });
    }
    for (const s of sleepUpserts) {
      await prisma.sleepRecord.upsert({
        where: { userId_date: { userId, date: s.date } },
        create: { userId, date: s.date, ...(s.data as Record<string, never>) },
        update: s.data,
      });
    }
    for (const p of stepUpserts) {
      await prisma.weRunRecord.upsert({
        where: { userId_date: { userId, date: p.date } },
        create: { userId, date: p.date, step: p.step },
        update: { step: p.step },
      });
    }

    return {
      hr: hrSamples.length,
      spo2: spo2Samples.length,
      sleep: sleepUpserts.length,
      steps: stepUpserts.length,
    };
  },

  /** V0.1.144 数据授权管理（设备绑定状态 + 各数据源授权标志，原型图"我的"tab）*/
  async authList(userId: string) {
    const bindings = await prisma.deviceBinding.findMany({ where: { userId } });
    const vendors = new Set(bindings.map((b) => b.vendor));
    return {
      bindings: bindings.map((b) => ({
        vendor: b.vendor,
        deviceName: b.accessTokenEnc ?? b.vendorUserId ?? null,
        status: b.status,
        lastSyncAt: b.lastSyncAt,
      })),
      weRunAuthorized: vendors.has('werun') || vendors.has('wechat'),
      garminAuthorized: vendors.has('garmin'),
      xiaomiAuthorized: vendors.has('xiaomi'),
      corosAuthorized: vendors.has('coros'),
      bleAuthorized: vendors.has('ble'),
    };
  },
};

// ===== 今日健康看板辅助函数（V0.1.25）=====

/** 东八区"今日"范围 [start, end) + dateStr（YYYY-MM-DD） */
function todayRangeCN(): { start: Date; end: Date; dateStr: string } {
  const now = new Date();
  const cn = new Date(now.getTime() + 8 * 3600 * 1000);
  const dateStr = cn.toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split('-').map(Number);
  // 东八区今日 0 点 = UTC 前一日 16 点
  const start = new Date(Date.UTC(y, m - 1, d) - 8 * 3600 * 1000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end, dateStr };
}

/** 秒 → 小时（1 位小数），null 透传 */
function secsToHours(sec: number | null | undefined): number | null {
  if (sec == null) return null;
  return Math.round((sec / 3600) * 10) / 10;
}

/** 睡眠总时长（深+浅+REM，小时），无数据返 null */
function sleepDurationHours(s: {
  deepSleepSeconds: number | null;
  lightSleepSeconds: number | null;
  remSleepSeconds: number | null;
}): number | null {
  const total =
    (s.deepSleepSeconds ?? 0) + (s.lightSleepSeconds ?? 0) + (s.remSleepSeconds ?? 0);
  if (total === 0) return null;
  return Math.round((total / 3600) * 10) / 10;
}

/** 从 sleepScores（嵌套 JSON）提取 overall/quality 评分 */
function extractSleepScore(scores: unknown): number | null {
  if (!scores || typeof scores !== 'object') return null;
  const obj = scores as Record<string, unknown>;
  const overall = obj.overall as Record<string, unknown> | undefined;
  const quality = obj.quality as Record<string, unknown> | undefined;
  const v = overall?.value ?? quality?.value ?? obj.value;
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 保留 2 位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 秒时间戳 → CN 时区 date "YYYY-MM-DD"（V0.1.43 syncWeRun 用）
 *
 * ⚠️ 微信运动 stepInfoList[].timestamp 是 Unix 秒（非毫秒）！
 *    错当毫秒会导致 date 全是 1970 年，myWeRun 查当月查不到。
 */
function cnDateFromTs(tsSec: number): string {
  const cn = new Date(tsSec * 1000 + 8 * 3600 * 1000);
  const y = cn.getUTCFullYear();
  const m = cn.getUTCMonth();
  const d = cn.getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 微信运动数据解密（V0.1.43）
 *
 * 微信 WXBizDataCrypt：session_key 作 AES-128-CBC 密钥，解密 encryptedData
 * 返 JSON：{ stepInfoList: [{timestamp, step}], watermark: {appid, ...} }
 */
/** 序列化为纯 JSON（Date → ISO string，适配 Prisma Json 字段） */
function toPureJson(obj: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

/** COROS 活动统一落库 RawActivity（vendor=coros；importCorosFit/terraWebhook/syncFromTerra 复用） */
async function upsertCorosRawActivity(
  userId: string,
  parsed: {
    startTime: Date;
    durationSec: number | null;
    distanceMeters: number | null;
    avgHr: number | null;
    maxHr: number | null;
    cadence: number | null;
    type: string;
  },
  rawJson: unknown,
) {
  const vendorActivityId = parsed.startTime.toISOString();
  return prisma.rawActivity.upsert({
    where: { vendor_vendorActivityId: { vendor: 'coros', vendorActivityId } },
    create: {
      userId,
      vendor: 'coros',
      vendorActivityId,
      type: parsed.type,
      startTime: parsed.startTime,
      durationSec: parsed.durationSec,
      distanceMeters: parsed.distanceMeters,
      avgHr: parsed.avgHr,
      maxHr: parsed.maxHr,
      cadence: parsed.cadence,
      raw: rawJson as Prisma.InputJsonValue,
      status: 'pending',
    },
    update: {
      type: parsed.type,
      durationSec: parsed.durationSec,
      distanceMeters: parsed.distanceMeters,
      avgHr: parsed.avgHr,
      maxHr: parsed.maxHr,
      cadence: parsed.cadence,
      raw: rawJson as Prisma.InputJsonValue,
    },
  });
}

function decryptWeRunData(
  sessionKey: string,
  encryptedData: string,
  iv: string,
): { stepInfoList?: { timestamp: number; step: number }[] } | null {
  try {
    const key = Buffer.from(sessionKey, 'base64');
    const ivBuf = Buffer.from(iv, 'base64');
    const encrypted = Buffer.from(encryptedData, 'base64');
    const decipher = createDecipheriv('aes-128-cbc', key, ivBuf);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}
