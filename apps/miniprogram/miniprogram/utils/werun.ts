// utils/werun.ts — 微信运动同步 + 历史查询封装（V0.1.44）
//
// 后端 device.syncWeRun（session_key AES 解密 → CN 时区 date → upsert WeRunRecord）
// + device.myWeRun（日期范围查询 + km 估算 + Cache 60s）已就绪，本文件封装前端调用链。
//
// 关键点：
// - wx.getWeRunData 需 scope.werun 授权（首次系统弹窗，拒绝返 null）
// - session_key 过期（TTL 7000s）→ wx.login 重登刷新 → 重试一次
// - 节流：首页每日首次同步（storage 记录上次同步日期）
import { api } from '../services/api';

/** CN 时区今日 YYYY-MM-DD（东八区）*/
export function cnToday(): string {
  const cn = new Date(Date.now() + 8 * 3600 * 1000);
  return cn.toISOString().slice(0, 10);
}

/** CN 时区本月范围 [startDate, endDate] YYYY-MM-DD（month 1-12）*/
export function cnMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  // 本月最后一天：Date.UTC(year, month, 0) — month(1-12) 作 index 等于下月，day=0 = 本月末日
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

/**
 * 同步微信运动到后端
 *
 * 流程：wx.getWeRunData（授权）→ encryptedData+iv → api.call('device','syncWeRun')
 * session_key 过期时自动 wx.login 重登 + 重试一次
 *
 * @returns { synced, days } 或 null（用户拒绝授权 / scope.werun 未授权）
 */
export async function syncWeRunToday(): Promise<{ synced: number; days: number } | null> {
  // 1. wx.getWeRunData（首次触发 scope.werun 授权弹窗）
  let encryptedData: string;
  let iv: string;
  try {
    const res = await new Promise<WechatMiniprogram.GetWeRunDataSuccessCallbackResult>(
      (resolve, reject) => wx.getWeRunData({ success: resolve, fail: reject }),
    );
    encryptedData = res.encryptedData;
    iv = res.iv;
  } catch {
    // 用户拒绝授权 / scope.werun 未授权 — 调用方引导 wx.openSetting
    return null;
  }

  // 2. 调后端 syncWeRun（session_key 过期则重登重试一次）
  try {
    return await api.call<{ synced: number; days: number }>('device', 'syncWeRun', {
      encryptedData,
      iv,
    });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (!msg.includes('session_key')) throw e;
    // session_key 过期 → wx.login 重新登录刷新缓存（必须存新 token，否则重试仍用旧失效 token）→ 重试
    const { code } = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
      (resolve, reject) => wx.login({ success: resolve, fail: reject }),
    );
    const loginRes = await api.call<{ accessToken: string; refreshToken: string }>('user', 'login', { code });
    wx.setStorageSync('accessToken', loginRes.accessToken);
    wx.setStorageSync('refreshToken', loginRes.refreshToken);
    return await api.call<{ synced: number; days: number }>('device', 'syncWeRun', {
      encryptedData,
      iv,
    });
  }
}

/**
 * 拉微信运动历史（调 myWeRun）
 *
 * @param startDate YYYY-MM-DD
 * @param endDate YYYY-MM-DD
 */
export async function getWeRunHistory(startDate: string, endDate: string) {
  return api.call<{
    records: Array<{ date: string; step: number; km: number }>;
    totalSteps: number;
    totalKm: number;
    days: number;
  }>('device', 'myWeRun', { startDate, endDate });
}

/**
 * 首页节流同步：每日首次调用同步一次
 *
 * storage `werun:lastSyncDate` 存 CN 今日日期，相同则跳过；
 * 同步成功（用户已授权）才更新日期，拒绝授权不重复打扰
 */
export async function syncWeRunIfFirstToday(): Promise<void> {
  const today = cnToday();
  if (wx.getStorageSync('werun:lastSyncDate') === today) return;
  const result = await syncWeRunToday();
  if (result) {
    wx.setStorageSync('werun:lastSyncDate', today);
  }
}
