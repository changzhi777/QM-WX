/**
 * 佳明数据导入脚本（B-2，2026-07-01）
 *
 * 解析佳明账户导出包 → 灌入 RawActivity / GarminSleep / GarminFitnessAge / GarminMetric
 *
 * 用法：
 *   DRY_RUN=stats  pnpm garmin-ingest   # 纯解析统计，不连 DB（默认）
 *   DRY_RUN=local  pnpm garmin-ingest   # 连本地 PG（DATABASE_URL）写
 *   DRY_RUN=false  pnpm garmin-ingest   # 连 DATABASE_URL 写（生产，经 SSH 隧道）
 *
 * env:
 *   GARMIN_DATA_DIR   数据包根路径（默认 ../../../佳明手表数据包）
 *   GARMIN_USER_ID    直接指定目标 userId（优先；云执行时先查张晨 userId 填入）
 *   GARMIN_USER_OPENID 按 openid 查找/创建用户（默认 garmin_11032831）
 *
 * 策略：
 * - createMany skipDuplicates 分批灌入（幂等，重跑跳过已存在）
 * - 灌完按 userId 失效 garmin:* 缓存
 * - distance 单位 = 厘米（/100 得米，已验证）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/infra/prisma.js';
import { Cache } from '../src/infra/cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GARMIN_DATA_DIR ?? path.resolve(__dirname, '../../../佳明手表数据包');
const DRY_RUN = (process.env.DRY_RUN ?? 'stats') as 'stats' | 'local' | 'false';
const USER_OPENID = process.env.GARMIN_USER_OPENID ?? 'garmin_11032831';
const BATCH = 100;
const FITNESS_DIR = 'DI_CONNECT/DI-Connect-Fitness';
const WELLNESS_DIR = 'DI_CONNECT/DI-Connect-Wellness';
const METRICS_DIR = 'DI_CONNECT/DI-Connect-Metrics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>;

/** metric 文件名前缀 → metricType */
const FILE_TYPE_MAP: Record<string, string> = {
  TrainingReadinessDTO: 'training_readiness',
  HillScore: 'hill_score',
  EnduranceScore: 'endurance_score',
  MetricsAcuteTrainingLoad: 'acute_load',
  MetricsHeatAltitudeAcclimation: 'heat_acclimation',
  MetricsMaxMetData: 'max_met',
  RunRacePredictions: 'run_race_predictions',
  TrainingHistory: 'training_history',
};

/** metricType → { value 字段, level 字段 }（raw 兜底全字段） */
const METRIC_FIELD_MAP: Record<string, { value?: string; level?: string }> = {
  training_readiness: { value: 'sleepScore', level: 'level' },
  hill_score: { value: 'overallScore', level: 'hillScoreClassificationId' },
  endurance_score: { value: 'overallScore', level: 'classification' },
  acute_load: { value: 'dailyTrainingLoadAcute', level: 'acwrStatus' },
  heat_acclimation: { value: 'heatAcclimationPercentage' },
  max_met: { value: 'maxMet', level: 'maxMetCategory' },
  run_race_predictions: {}, // 多距离预测，无单一 value，靠 raw
  training_history: { level: 'trainingStatus' },
};

function readJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === 'number') return new Date(v); // ms 时间戳（HillScore/Endurance/AcuteLoad）
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function log(...a: unknown[]) {
  console.log('[garmin-ingest]', ...a);
}

// ===== 解析 =====

function parseActivities() {
  const d = readJson(`${FITNESS_DIR}/8616680518888_0_summarizedActivities.json`) as [{ summarizedActivitiesExport: Rec[] }];
  const acts = d[0].summarizedActivitiesExport;
  return acts.map((a) => ({
    vendor: 'garmin',
    vendorActivityId: String(a.activityId),
    type: String(a.sportType ?? a.activityType ?? 'unknown').toLowerCase(),
    startTime: toDate(a.beginTimestamp) ?? new Date(0),
    durationSec: typeof a.duration === 'number' ? Math.round(a.duration / 1000) : null, // ms → s
    distanceMeters: typeof a.distance === 'number' ? a.distance / 100 : null, // cm → m（已验证）
    avgHr: (a.avgHr as number | null) ?? null,
    maxHr: (a.maxHr as number | null) ?? null,
    cadence: (a.avgRunCadence as number | null) ?? null,
    raw: a,
  }));
}

function parseSleep() {
  const files = fs.readdirSync(path.join(DATA_DIR, WELLNESS_DIR)).filter((f) => f.includes('sleepData'));
  const seen = new Set<string>();
  const out: Rec[] = [];
  for (const f of files) {
    const arr = readJson(`${WELLNESS_DIR}/${f}`) as Rec[];
    for (const s of arr) {
      const cd = toDate(s.calendarDate);
      if (!cd) continue;
      const key = cd.toISOString().slice(0, 10);
      if (seen.has(key)) continue; // 跨段日期去重
      seen.add(key);
      out.push({
        calendarDate: cd,
        sleepStartGMT: toDate(s.sleepStartTimestampGMT),
        sleepEndGMT: toDate(s.sleepEndTimestampGMT),
        deepSleepSeconds: s.deepSleepSeconds ?? null,
        lightSleepSeconds: s.lightSleepSeconds ?? null,
        remSleepSeconds: s.remSleepSeconds ?? null,
        awakeSleepSeconds: s.awakeSleepSeconds ?? null,
        unmeasurableSeconds: s.unmeasurableSeconds ?? null,
        averageRespiration: s.averageRespiration ?? null,
        lowestRespiration: s.lowestRespiration ?? null,
        highestRespiration: s.highestRespiration ?? null,
        awakeCount: s.awakeCount ?? null,
        avgSleepStress: s.avgSleepStress ?? null,
        sleepScores: s.sleepScores ?? null,
        raw: s,
      });
    }
  }
  return out;
}

function parseFitnessAge() {
  const arr = readJson(`${WELLNESS_DIR}/11032831_fitnessAgeData.json`) as Rec[];
  return arr.map((f) => ({
    asOfDate: toDate(f.asOfDateGmt) ?? new Date(0),
    chronologicalAge: f.chronologicalAge ?? null,
    bmi: f.bmi ?? null,
    rhr: f.rhr ?? null,
    vo2Max: f.biometricVo2Max ?? null,
    currentBioAge: f.currentBioAge ?? null,
    totalVigorousDays: f.totalVigorousDays ?? null,
    raw: f,
  }));
}

function parseMetrics() {
  const files = fs.readdirSync(path.join(DATA_DIR, METRICS_DIR)).filter((f) => f.endsWith('.json'));
  const out: Rec[] = [];
  for (const f of files) {
    const prefix = Object.keys(FILE_TYPE_MAP).find((p) => f.startsWith(p));
    if (!prefix) continue; // 跳过 zip 等非指标文件
    const metricType = FILE_TYPE_MAP[prefix];
    const fm = METRIC_FIELD_MAP[metricType] ?? {};
    const arr = readJson(`${METRICS_DIR}/${f}`) as Rec[];
    for (const rec of arr) {
      out.push({
        metricType,
        sport: rec.sport ? String(rec.sport).toLowerCase() : null,
        calendarDate: toDate(rec.calendarDate),
        value: fm.value && typeof rec[fm.value] === 'number' ? rec[fm.value] : null,
        level: fm.level && rec[fm.level] != null ? String(rec[fm.level]) : null,
        raw: rec,
      });
    }
  }
  return out;
}

// ===== 灌入 =====

async function resolveUser(): Promise<string> {
  if (process.env.GARMIN_USER_ID) {
    log(`复用指定 userId=${process.env.GARMIN_USER_ID}`);
    return process.env.GARMIN_USER_ID;
  }
  const existing = await prisma.user.findUnique({ where: { openid: USER_OPENID } });
  if (existing) {
    log(`复用用户 openid=${USER_OPENID} → ${existing.id}`);
    return existing.id;
  }
  const created = await prisma.user.create({ data: { openid: USER_OPENID, nickname: '张晨(佳明)' } });
  log(`创建用户 openid=${USER_OPENID} → ${created.id}`);
  return created.id;
}

async function batchCreate(model: { createMany: (a: { data: Rec[]; skipDuplicates: boolean }) => Promise<{ count: number }> }, rows: Rec[], label: string) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const r = await model.createMany({ data: chunk, skipDuplicates: true });
    inserted += r.count;
  }
  log(`${label}: parsed=${rows.length} inserted=${inserted}`);
}

async function main() {
  log(`DRY_RUN=${DRY_RUN} DATA_DIR=${DATA_DIR}`);

  const activities = parseActivities();
  const sleep = parseSleep();
  const fitnessAge = parseFitnessAge();
  const metrics = parseMetrics();

  log(`解析完成: activities=${activities.length} sleep=${sleep.length} fitnessAge=${fitnessAge.length} metrics=${metrics.length}`);

  // distance 抽样核对（应为合理跑步距离）
  const sample = activities.filter((a) => a.distanceMeters != null).slice(0, 5);
  log(`distance 抽样(公里): ${sample.map((a) => (a.distanceMeters! / 1000).toFixed(2)).join(', ')}`);

  if (DRY_RUN === 'stats') {
    log('DRY_RUN=stats → 不连 DB，结束');
    return;
  }

  const userId = await resolveUser();
  const withUser = (rows: Rec[]) => rows.map((r) => ({ userId, ...r }));

  await batchCreate(prisma.rawActivity, withUser(activities), 'activities');
  await batchCreate(prisma.garminSleep, withUser(sleep), 'sleep');
  await batchCreate(prisma.garminFitnessAge, withUser(fitnessAge), 'fitnessAge');
  await batchCreate(prisma.garminMetric, withUser(metrics), 'metrics');

  // 灌完失效该用户 garmin 缓存
  await Cache.delByPattern(`garmin:activities:${userId}:*`);
  await Cache.delByPattern(`garmin:sleep:${userId}:*`);
  await Cache.delByPattern(`garmin:metrics:${userId}:*`);
  await Cache.delByPattern(`garmin:fitnessAge:${userId}:*`);
  log('缓存已失效');

  await prisma.$disconnect();
  log('完成 ✅');
}

// process.exit 强制退出 — redis/prisma 单例连接会保持事件循环，脚本须显式退出
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[garmin-ingest] 失败:', e);
    process.exit(1);
  });
