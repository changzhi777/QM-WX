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

/** 主入口：解压 ZIP + 解析 + 转 Checkin */
export interface ParseResult {
  activities: ParsedCheckin[];
  rawCount: number;       // 原始记录数
  filteredCount: number;  // 有距离的记录数
}

export async function parseHuaweiExport(buffer: Buffer, password?: string): Promise<ParseResult> {
  const directory = await unzipper.Open.buffer(buffer);

  // 找 motion path detail data JSON（兼容大小写 + 文件名前缀匹配）
  const motionFile = directory.files.find(
    (f) => /motion[ _]path[ _]detail[ _]data.*\.json$/i.test(f.path),
  );
  if (!motionFile) {
    throw new Error('未找到 motion path detail data JSON（请确认 ZIP 是华为运动健康隐私中心导出）');
  }

  // 解压（password 可选：AES 加密 ZIP 必需）
  const text = (await motionFile.buffer(password)).toString('utf8');
  const activities = parseMotionJson(text).map(toCheckin);

  return {
    activities,
    rawCount: activities.length,
    filteredCount: activities.filter((a) => a.distanceKm > 0).length,
  };
}
