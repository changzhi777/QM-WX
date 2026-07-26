/**
 * jobs/device-poll-pull.job.ts — 设备数据主动拉取 worker（V0.3.1 多 vendor 扩展）
 *
 * 触发:BullMQ repeatable(每 24 小时)+ 启动预热一次
 * 目的:替代 Mosquitto broker — cron 主动从多 vendor 数据源回流到 DeviceDailyActivity 表
 *
 * V0.3.1 数据源：
 *   - wechat:V0.2.113 syncWeRun（已有数据，wx.getWeRunData + AES-128-CBC）
 *     step: 步数（唯一字段，distance/calorie schema 无）
 *   - garmin:V0.3.1 mock（V0.2.128 已实装 coros_fit/garmin OAuth 同步框架，V0.3.1 扩展到每日活动）
 *     真实接入待 V0.3.1 主人拍板 OAuth 凭据；当前 mock 数据
 *   - terra:V0.3.1 mock（待 V0.3.1 主人签约 Terra 后接入 HTTPS API）
 *     真实接入前 mock 数据
 *
 * V0.2.151 cleanup + V0.2.153 WeRun + V0.3.1 Garmin/Terra mock
 *
 * 详见 V0.2.153 commit + memory mosquitto-5x-debug-root-cause.md
 */
import { prisma } from '../infra/prisma.js';
import { logger } from '../common/logger.js';

export interface DevicePollPullJobData {}

/** V0.3.1 vendor enum（强类型 vendor 列表） */
export type DeviceVendor = 'wechat' | 'garmin' | 'terra';

export interface DailyData {
  vendor: DeviceVendor;
  date: string; // YYYY-MM-DD
  step?: number;
  distanceM?: number;
  caloriesKcal?: number;
  sleepMin?: number;
  activeMin?: number;
}

export interface DevicePollPullResult {
  activeUserCount: number;
  perVendorCount: Record<DeviceVendor, { pulledDaysCount: number; upsertedCount: number; skippedDaysCount: number }>;
  totalUpsertedCount: number;
}

// ===== 3 vendor 数据源 =====

/** WeRunRecord 单天聚合（V0.2.153 wechat 数据源） */
async function fetchWechatData(userId: string, since: Date): Promise<DailyData[]> {
  const dates = await prisma.weRunRecord.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
  });
  if (dates.length === 0) return [];
  const result: DailyData[] = [];
  for (const { date } of dates) {
    const records = await prisma.weRunRecord.findMany({
      where: { userId, date },
      select: { step: true },
    });
    if (records.length === 0) continue;
    const step = records.reduce((s, r) => s + r.step, 0);
    result.push({ vendor: 'wechat', date, step });
  }
  return result;
}

/** Garmin mock（V0.3.1 — 真实 OAuth 接入待 V0.3.1 主人拍板凭据） */
async function fetchGarminData(_userId: string, _since: Date): Promise<DailyData[]> {
  // TODO V0.3.1 真实接入：Garmin Health API（V0.2.75 已实装 OAuth 同步框架，V0.2.128 COROS 复用）
  // 当前 mock：每个用户 1 天假数据（仅开发/测试环境，避免 V0.3.1 真实接入前漏数据）
  // 返回空数组：跳过 mock 注入，避免污染真实数据
  // V0.3.1 真实接入后：fetch Garmin daily summary API → upsert
  return [];
}

/** Terra mock（V0.3.1 — 真实 HTTPS API 接入待 V0.3.1 主人签约 Terra） */
async function fetchTerraData(_userId: string, _since: Date): Promise<DailyData[]> {
  // TODO V0.3.1 真实接入：Terra HTTPS API（V0.2.69-71 调研，签约后接入 daily/sleep/activity）
  // 当前 mock：返回空（同 Garmin mock 理由）
  return [];
}

// ===== upsert 共享 helper =====

async function upsertDailyActivity(
  userId: string,
  data: DailyData,
): Promise<'created' | 'updated'> {
  const existing = await prisma.deviceDailyActivity.findFirst({
    where: { userId, vendor: data.vendor, date: data.date },
  });
  const fields = {
    step: data.step ?? 0,
    distanceM: data.distanceM ?? 0,
    caloriesKcal: data.caloriesKcal ?? 0,
    sleepMin: data.sleepMin ?? 0,
    activeMin: data.activeMin ?? 0,
    source: 'api' as const,
  };
  if (existing) {
    await prisma.deviceDailyActivity.update({ where: { id: existing.id }, data: fields });
    return 'updated';
  }
  await prisma.deviceDailyActivity.create({
    data: { userId, vendor: data.vendor, date: data.date, ...fields },
  });
  return 'created';
}

export async function processDevicePollPull(): Promise<DevicePollPullResult> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000);

  // 1. 清点最近 7 天活跃用户（V0.2.113 weRunRecord 维度）
  const activeUsers = await prisma.user.findMany({
    where: { weRunRecords: { some: { createdAt: { gte: since } } } },
    select: { id: true },
    take: 1000,
  });

  // V0.3.1 多 vendor fetch 函数数组（并行 Promise.allSettled 隔离失败）
  const vendorFetchers: Array<{ vendor: DeviceVendor; fetch: (userId: string, since: Date) => Promise<DailyData[]> }> = [
    { vendor: 'wechat', fetch: fetchWechatData },
    { vendor: 'garmin', fetch: fetchGarminData },
    { vendor: 'terra', fetch: fetchTerraData },
  ];

  const perVendorCount: Record<DeviceVendor, { pulledDaysCount: number; upsertedCount: number; skippedDaysCount: number }> = {
    wechat: { pulledDaysCount: 0, upsertedCount: 0, skippedDaysCount: 0 },
    garmin: { pulledDaysCount: 0, upsertedCount: 0, skippedDaysCount: 0 },
    terra: { pulledDaysCount: 0, upsertedCount: 0, skippedDaysCount: 0 },
  };
  let totalUpsertedCount = 0;

  // 2. 对每个用户调 3 vendor fetch（并行 + 失败隔离）
  for (const u of activeUsers) {
    const results = await Promise.allSettled(
      vendorFetchers.map(async ({ vendor, fetch }) => {
        const data = await fetch(u.id, since);
        for (const d of data) {
          perVendorCount[vendor].pulledDaysCount++;
          try {
            await upsertDailyActivity(u.id, d);
            perVendorCount[vendor].upsertedCount++;
          } catch (e) {
            logger.error(
              { err: (e as Error).message, userId: u.id, vendor, date: d.date },
              'device-poll-pull upsert failed',
            );
            perVendorCount[vendor].skippedDaysCount++;
          }
        }
      }),
    );
    // 记录 vendor fetch 整体失败（不影响主流程）
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error(
          { err: (r.reason as Error).message, userId: u.id, vendor: vendorFetchers[i].vendor },
          'device-poll-pull vendor fetch failed',
        );
      }
    });
  }

  totalUpsertedCount =
    perVendorCount.wechat.upsertedCount +
    perVendorCount.garmin.upsertedCount +
    perVendorCount.terra.upsertedCount;

  const result: DevicePollPullResult = {
    activeUserCount: activeUsers.length,
    perVendorCount,
    totalUpsertedCount,
  };

  if (totalUpsertedCount > 0) {
    logger.info(result, 'device-poll-pull backfilled DeviceDailyActivity from 3 vendors');
  }
  return result;
}