/**
 * Terra webhook payload 标准化 → Checkin 输入（阶段 3.3）
 *
 * Terra 推送 5 类事件（activity/daily/body/sleep/menstruation），本文件处理 activity（运动）。
 * 字段参考 Terra docs（distance_m / duration_s / avg_hr_bpm / summary_id / source）。
 * 签约后真 payload 到位再校准字段名（预留 tolerant 解析）。
 */

/** Terra activity 单条记录（tolerant：字段可选，缺则跳过）*/
export interface TerraActivityEntry {
  metadata?: {
    summary_id?: string;
    start_time?: string;
    end_time?: string;
    source?: string; // garmin / coros / suunto / zepp / amazfit / strava ...
  };
  distance?: { distance_m?: number };
  duration?: { duration_s?: number };
  heart_rate?: { avg_hr_bpm?: number };
  activity?: { type?: string };
}

export interface TerraPayload {
  type?: string; // activity / daily / body / sleep / menstruation
  data?: TerraActivityEntry[];
  user?: { user_id?: string; reference_id?: string };
}

/** Terra source → 沐禾 dataSource 映射 */
const SOURCE_TO_DATASOURCE: Record<string, string> = {
  garmin: 'terra_garmin',
  coros: 'terra_coros',
  suunto: 'terra_suunto',
  zepp: 'terra_zepp',
  amazfit: 'terra_zepp',
  strava: 'terra_strava',
  apple: 'terra_apple',
  fitbit: 'terra_fitbit',
  whoop: 'terra_whoop',
  oura: 'terra_oura',
};

export function mapDataSource(source?: string): string {
  if (!source) return 'terra';
  const key = source.toLowerCase();
  return SOURCE_TO_DATASOURCE[key] ?? `terra_${key}`;
}

export interface StandardCheckin {
  distance: number; // km
  durationSec?: number;
  heartRate?: number;
  date: string; // YYYY-MM-DD
  dataSource: string;
  sportType: string;
  summaryId?: string;
}

/** Terra activity entry → 标准 Checkin 输入。距离 < 0.5km 返 null（非有效运动）。*/
export function terraActivityToCheckin(entry: TerraActivityEntry): StandardCheckin | null {
  const distanceM = entry.distance?.distance_m;
  if (distanceM == null || distanceM <= 0) return null;
  const distanceKm = Math.round((distanceM / 1000) * 10) / 10;
  if (distanceKm < 0.5) return null; // 非运动（防作弊下限对齐 CheckinInputSchema）

  const start = entry.metadata?.start_time ?? '';
  const date = start.length >= 10 ? start.slice(0, 10) : new Date().toISOString().slice(0, 10);

  return {
    distance: distanceKm,
    durationSec: entry.duration?.duration_s,
    heartRate: entry.heart_rate?.avg_hr_bpm,
    date,
    dataSource: mapDataSource(entry.metadata?.source),
    sportType: 'run',
    summaryId: entry.metadata?.summary_id,
  };
}
