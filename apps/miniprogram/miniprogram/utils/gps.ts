// utils/gps.ts — GPS 打卡基础工具（V0.3 阶段 0：Haversine 距离 + 轨迹累计 + 配速）
// 用于 sport GPS 跑步模式（wx.getLocation 持续记录轨迹点 → 算距离/配速）
// 阶段 A 集成（wx.getLocation + UI）待新会话；本文件为纯函数基础设施，无 wx 依赖

/** 角度转弧度 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine 公式：两点间球面距离（km）*/
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球半径 km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GpsPoint {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

/**
 * 轨迹点累计距离（km）
 * 过滤 GPS 抖动：单段 <5m 当噪声跳过（防止原地静止累计假距离）
 */
export function totalDistance(points: GpsPoint[], minSegmentKm = 0.005): number {
  if (points.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const seg = haversineDistance(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
    if (seg >= minSegmentKm) dist += seg;
  }
  return dist;
}

/** 配速计算（sec/km）；距离不足或时长 0 返 null */
export function calcPace(distanceKm: number, durationSec: number): number | null {
  if (distanceKm < 0.001 || durationSec <= 0) return null;
  return durationSec / distanceKm;
}

/** 配速格式化 sec/km → "M'SS\""（如 330 → 5'30"）*/
export function formatPaceStr(paceSecPerKm: number): string {
  if (!isFinite(paceSecPerKm) || paceSecPerKm <= 0) return '—';
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

/** 时长格式化 sec → "M分S秒" 或 "H小时M分" */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  if (sec < 3600) return `${Math.floor(sec / 60)}分${sec % 60}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}小时${m}分`;
}
