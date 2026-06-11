// utils/auth.ts — 登录态管理
import { api } from '../services/api';
import type { User, FeatureFlagsConfig } from '@qm-wx/shared';

const app = getApp();

/** 业务页（如打卡/下单/进群）调用：未登录就补登录 */
export async function ensureLogin(): Promise<{ user: User; accessToken: string }> {
  if (app.globalData.user && app.globalData.accessToken) {
    return { user: app.globalData.user, accessToken: app.globalData.accessToken };
  }

  return doLogin();
}

/** 强制登录（用于必须登录才能继续的页面） */
export async function requireLogin(): Promise<{ user: User; accessToken: string }> {
  return ensureLogin();
}

/** 实际执行 wx.login → 后端登录 */
async function doLogin(): Promise<{ user: User; accessToken: string }> {
  // 1. wx.login 拿 code
  const { code } = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });

  // 2. 调后端登录
  const result = await api.call<{
    user: User;
    accessToken: string;
    refreshToken: string;
    config: { featureFlags: FeatureFlagsConfig; memberLevels: unknown; pointsRules: unknown };
  }>('user', 'login', { code });

  // 3. 缓存（token 存 storage 兜底；user / config 存 globalData 走热路径）
  wx.setStorageSync('accessToken', result.accessToken);
  wx.setStorageSync('refreshToken', result.refreshToken);
  wx.setStorageSync('currentUser', result.user);
  app.globalData.user = result.user;
  app.globalData.accessToken = result.accessToken;
  app.globalData.config = result.config;

  return { user: result.user, accessToken: result.accessToken };
}

/** 退出登录（清 storage + 跳首页） */
export function logout() {
  wx.removeStorageSync('accessToken');
  wx.removeStorageSync('refreshToken');
  wx.removeStorageSync('currentUser');
  app.globalData.user = null;
  app.globalData.accessToken = '';
  app.globalData.config = null;
  wx.reLaunch({ url: '/pages/index/index' });
}

/** 静默登录：app.onLaunch 调用，不阻塞启动 */
export async function silentLogin(): Promise<void> {
  const cached = wx.getStorageSync('accessToken');
  if (!cached) return; // 没缓存就不强求

  app.globalData.accessToken = cached;

  // 用缓存 token 调 /api/user me 拉最新 user / config
  // 失败由 services/api.ts 的 401 处理（refresh → 重试）
  try {
    const result = await api.call<{
      user: User;
      config: { featureFlags: FeatureFlagsConfig; memberLevels: unknown; pointsRules: unknown };
    }>('user', 'me', {});
    wx.setStorageSync('currentUser', result.user);
    app.globalData.user = result.user;
    app.globalData.config = result.config;
  } catch {
    // 静默失败，用户进业务页时 ensureLogin 兜底
  }
}
