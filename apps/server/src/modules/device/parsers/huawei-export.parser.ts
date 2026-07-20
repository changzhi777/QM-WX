/**
 * 华为运动健康 (Huawei Health) 导出解析器（V0.2.2 init #11 落地）
 *
 * 数据流（基于 CTHRU/Hitrava v6.3.0 逆向 schema）：
 *   HiZip.zip（AES 加密 / 用户设密码）
 *   └── Motion path detail data & description/
 *       └── motion path detail data{epoch_ms}.json  ← 全部运动记录
 *
 * 顶层 JSON 结构（2020-07+ 沿用至 2025-01）：
 *   {
 *     "data": [
 *       { sportType, startTime, totalTime, totalDistance, totalCalories,
 *         timeZone, attribute, recordDay?, sportDataSource? }
 *     ]
 *   }
 *
 * `attribute` 字段（HiTrack 二进制 + 内嵌 JSON，用 `&&HW_EXT_TRACK_SIMPLIFY@is` 分隔）：
 *   HW_EXT_TRACK_DETAIL@is{tp=lbs...tp=h-r...tp=alt...}
 *   &&HW_EXT_TRACK_SIMPLIFY@is{"totalDistance":5000,"totalCalories":350000,"mSwimSegments":[...]}
 *
 * sportType 枚举（Hitrava 实测 / 2020-07+ 沿用）：
 *   4=run / 5=walk / 3=cycle / 101=indoor_run / 102=pool_swim
 *   103=indoor_cycle / 104=open_water_swim / 111=cross_trainer
 *   118=cross_country_run / 145=crossfit / 282=hiking / 2=mountain_hike / 117=other
 *
 * 单位陷阱：
 *   startTime  → ms（不是秒）→ ×1 直接 new Date()
 *   totalTime  → ms → ÷1000 → sec
 *   totalDistance → m → ÷1000 → km
 *   totalCalories → 毫卡 → ÷1000 → kcal
 *   HiTrack tp=rs → dm/s → ÷10 → m/s（暂不解析 HiTrack 二进制）
 *
 * 格式兼容（必须降级而非报错）：
 *   2020-07 后：recordDay 可选（顶层 startTime 已含日期）
 *   2021-04 后：HiTrack 内时间戳改相对值（暂只解析顶层 JSON）
 *   2024-07 → 2025-01：部分数据缺失/补回（HR/速度 优雅降级）
 *
 * 参考：
 *   - CTHRU/Hitrava（https://github.com/CTHRU/Hitrava）v6.3.0 / 421 stars
 *   - Hitrava v6.0.0 "Huawei 2025 ZIP format" 支持
 *   - 本实现未移植 HiTrack 二进制解析（Pass2 再加）
 */
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';

export interface HuaweiActivity {
  sportType: number;
  startTime: number;        // ms epoch
  totalTime: number;        // ms
  totalDistance: number;    // m
  totalCalories: number;    // 毫卡
  timeZone?: string;        // +HHMM
  recordDay?: number;       // YYYYMMDD（2020-07 后可能缺）
  sportDataSource?: number; // 2=手动
  attribute?: string;       // HiTrack + 内嵌 JSON
}

export interface ParsedCheckin {
  sport: string;            // QM-WX sport enum
  startedAt: Date;
  durationSec: number;
  distanceKm: number;
  calories: number;         // kcal
  source: 'huawei_export';
  raw: HuaweiActivity;      // 保留原始数据可追溯
}

/** sportType 4/101 跑 → QM-WX 'run' / 'indoor_run'（统一 'run' 简化）*/
const SPORT_TYPE_MAP: Record<number, string> = {
  2: 'hike',                // Mountain Hike
  3: 'cycling',
  4: 'run',                 // Run 户外跑（主目标）
  5: 'walk',
  101: 'run',               // Indoor Run → run（统一）
  102: 'swim',              // Pool Swim
  103: 'cycling',           // Indoor Cycle
  104: 'swim',              // Open Water Swim
  111: 'cross_trainer',
  118: 'run',               // Cross Country Run → run
  145: 'crossfit',
  282: 'hike',              // Hike → hike
  117: 'other',
};

const DEFAULT_SPORT = 'other';

/** 解析顶层 JSON 数组（兼容 data 包裹 + 裸数组）*/
export function parseMotionJson(text: string): HuaweiActivity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed as HuaweiActivity[];
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: HuaweiActivity[] }).data;
  }
  return [];
}

/** 解析 attribute 内嵌 JSON 部分（提取 totalDistance/totalCalories/mSwimSegments 优先级覆盖）*/
export function parseAttribute(attr: string | undefined): {
  totalDistance?: number; // m
  totalCalories?: number; // 毫卡
} {
  if (!attr) return {};
  const parts = attr.split('&&HW_EXT_TRACK_SIMPLIFY@is');
  if (parts.length < 2) return {};
  try {
    const obj = JSON.parse(parts[1]) as {
      totalDistance?: number;
      totalCalories?: number;
    };
    return {
      totalDistance: typeof obj.totalDistance === 'number' ? obj.totalDistance : undefined,
      totalCalories: typeof obj.totalCalories === 'number' ? obj.totalCalories : undefined,
    };
  } catch {
    return {};
  }
}

/** 转换 HuaweiActivity → ParsedCheckin（含降级处理）*/
export function toCheckin(activity: HuaweiActivity): ParsedCheckin {
  const attr = parseAttribute(activity.attribute);
  // attribute 内嵌 JSON 优先级 > 顶层字段（Hitrava 实测 attribute 更精确）
  const distanceM = attr.totalDistance ?? activity.totalDistance ?? 0;
  const caloriesMilli = attr.totalCalories ?? activity.totalCalories ?? 0;
  const sport = SPORT_TYPE_MAP[activity.sportType] ?? DEFAULT_SPORT;

  return {
    sport,
    startedAt: new Date(activity.startTime), // 假设 startTime 是绝对 ms
    durationSec: Math.round((activity.totalTime ?? 0) / 1000),
    distanceKm: distanceM / 1000,
    calories: caloriesMilli / 1000, // 毫卡 → kcal
    source: 'huawei_export',
    raw: activity,
  };
}

// ===== V0.2.47 TCX 支持（华为「运动记录导出」exportSportData / Garmin 通用格式）=====

const tcxParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/** TCX Activity@Sport → QM sport（Garmin 标准枚举）*/
const TCX_SPORT_MAP: Record<string, string> = {
  Running: 'run',
  Biking: 'cycling',
  Cycling: 'cycling',
  MountainBiking: 'cycling',
  Swimming: 'swim',
  Walking: 'walk',
  Hiking: 'hike',
  Other: 'other',
};

/**
 * 解析 TCX（TrainingCenterDatabase XML）→ ParsedCheckin[]
 *
 * 华为「运动记录导出」(exportSportData) 每条运动一个 .tcx（Garmin/Strava 通用标准格式）。
 * 结构：TrainingCenterDatabase > Activities > Activity{ @Sport, Id, Lap[]{ TotalTimeSeconds, DistanceMeters, Calories?, AverageHeartRateBpm?{Value} } }
 * Lap 可能单数或多圈（数组），多圈累加 duration/distance/calories。
 */
export function parseTcxXml(text: string): ParsedCheckin[] {
  let obj: unknown;
  try {
    obj = tcxParser.parse(text);
  } catch {
    return [];
  }
  const tcd = (obj as { TrainingCenterDatabase?: { Activities?: { Activity?: unknown } } })
    ?.TrainingCenterDatabase;
  const activity = tcd?.Activities?.Activity;
  if (!activity) return [];
  const acts = Array.isArray(activity) ? activity : [activity];
  return acts.map((a): ParsedCheckin => {
    const act = a as { '@_Sport'?: string; Id?: string; Lap?: unknown };
    const lapsRaw = act.Lap;
    const laps = Array.isArray(lapsRaw) ? lapsRaw : lapsRaw ? [lapsRaw] : [];
    // fast-xml-parser 把无子节点的文本元素解析为 string，数值字段统一 parseFloat 兜底
    const num = (l: unknown, k: string): number => {
      const v = (l as Record<string, unknown>)?.[k];
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
      return Number.isFinite(n) ? n : 0;
    };
    const totalSec = laps.reduce((s, l) => s + num(l, 'TotalTimeSeconds'), 0);
    const totalDist = laps.reduce((s, l) => s + num(l, 'DistanceMeters'), 0);
    const totalCal = laps.reduce((s, l) => s + num(l, 'Calories'), 0);
    const hrVals = laps
      .map((l) =>
        num((l as { AverageHeartRateBpm?: { Value?: number } })?.AverageHeartRateBpm, 'Value'),
      )
      .filter((v) => v > 0);
    const avgHr = hrVals.length
      ? Math.round(hrVals.reduce((s, v) => s + v, 0) / hrVals.length)
      : undefined;
    const idStr = act.Id ?? (laps[0] as { '@_StartTime'?: string })?.['@_StartTime'];
    return {
      sport: TCX_SPORT_MAP[act['@_Sport'] ?? ''] ?? 'other',
      startedAt: idStr ? new Date(idStr) : new Date(),
      durationSec: Math.round(totalSec),
      distanceKm: totalDist / 1000,
      calories: totalCal,
      source: 'huawei_export',
      // raw 保留 TCX 原始关键字段用于追溯（avgHr 是 TCX 派生，HuaweiActivity 类型擦除）
      raw: {
        sportType: -1,
        startTime: idStr ? new Date(idStr).getTime() : Date.now(),
        totalTime: totalSec * 1000,
        totalDistance: totalDist,
        totalCalories: totalCal * 1000,
        attribute: `tcx:${act['@_Sport'] ?? ''}`,
        ...(avgHr ? { avgHr } : {}),
      } as unknown as HuaweiActivity,
    };
  });
}

/** 主入口：解压 ZIP + 解析 + 转 Checkin */
export interface ParseResult {
  activities: ParsedCheckin[];
  rawCount: number;       // 原始记录数
  filteredCount: number;  // 有距离的记录数
}

export async function parseHuaweiExport(buffer: Buffer, password?: string): Promise<ParseResult> {
  const directory = await unzipper.Open.buffer(buffer);

  // 优先找 motion path detail data JSON（隐私中心导出，Hitrava JSON）
  const motionFile = directory.files.find(
    (f) => /motion[ _]path[ _]detail[ _]data.*\.json$/i.test(f.path),
  );
  if (motionFile) {
    const text = (await motionFile.buffer(password)).toString('utf8');
    const activities = parseMotionJson(text).map(toCheckin);
    return {
      activities,
      rawCount: activities.length,
      filteredCount: activities.filter((a) => a.distanceKm > 0).length,
    };
  }

  // V0.2.47 fallback：运动记录导出（exportSportData）= TCX 文件批量解析
  const tcxFiles = directory.files.filter((f) => /\.tcx$/i.test(f.path));
  if (tcxFiles.length === 0) {
    throw new Error('未找到 motion path detail data JSON 或 .tcx 文件（请确认 ZIP 是华为运动健康导出）');
  }
  const all: ParsedCheckin[] = [];
  for (const f of tcxFiles) {
    try {
      const text = (await f.buffer(password)).toString('utf8');
      all.push(...parseTcxXml(text));
    } catch {
      // 单个 tcx 解析失败跳过（优雅降级，不阻塞其他文件）
    }
  }
  return {
    activities: all,
    rawCount: all.length,
    filteredCount: all.filter((a) => a.distanceKm > 0).length,
  };
}
