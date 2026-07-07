// services/api.ts — 统一 API 封装
// 替代旧 cloudfunctions/* 的 callFunction
//
// 用法：
//   import { api } from '@/services/api';
//   const { user } = await api.call<User>('user', 'login', { code });
//   const { list } = await api.call<Product[]>('mall', 'listProducts', { page: 1 });

import { ENDPOINTS, type ActionRequest, type ApiResponse, type User } from '@qm-wx/shared';
// actionUrl 走子路径 export，避开根入口的 ESM .js 后缀解析问题
import { actionUrl } from '@qm-wx/shared/api-contracts';

// 临时 mock 开关（接通公网后默认 false；想再用预览模式改 true 即可）
// 用途：体验版/真机未配 request 合法域名时，让 UI 仍能预览显示
// 当前覆盖：首页用到的 2 个 API（user.login / sport.myStats）
const USE_MOCK_DATA = false;

const MOCK_RESPONSES: Record<string, unknown> = {
  'user.login': {
    user: {
      id: 'mock_user_001',
      openid: 'mock_openid_001',
      nickname: '体验用户',
      avatarUrl: null,
      points: 1280,
      createdAt: '2026-06-01T00:00:00Z',
    },
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token',
    config: {
      featureFlags: {
        wallet: false,
        payment: false,
        membershipPurchase: false,
        smartAgent: false,
        bindApp: false,
      },
      memberLevels: {},
      pointsRules: {},
    },
  },
  'sport.myStats': {
    totalDistance: 25.6, // 本周累计公里
    count: 5, // 打卡次数
    avgPace: 5.5, // 平均配速（min/km，5'30"）
  },
};

const getMock = (module: string, action: string): unknown | undefined =>
  MOCK_RESPONSES[`${module}.${action}`];

const getBaseUrl = (): string => {
  const base = (wx as unknown as { $apiBase?: string }).$apiBase;
  if (base) return base;
  // 未注入 $apiBase：仅开发版允许回退 localhost；体验版/正式版必须显式配置，否则 fail-fast。
  let envVersion = 'develop';
  try {
    envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
  } catch {
    // 部分基础库不支持 getAccountInfoSync → 当作开发版
  }
  if (envVersion === 'release' || envVersion === 'trial') {
    throw new Error('API 基础地址未配置（$apiBase）：正式/体验版必须注入 HTTPS 后端地址');
  }
  return 'http://localhost:3000';
};

let refreshing: Promise<void> | null = null;

export const api = {
  /**
   * 统一调用入口
   *
   * @param retried 内部递归标记：401 刷新后只重试一次，防止 token 持续失效导致无限循环
   */
  async call<T = unknown>(
    module: keyof typeof ENDPOINTS,
    action: string,
    payload: unknown = {},
    retried = false,
  ): Promise<T> {
    // 临时 mock 短路（USE_MOCK_DATA=false 时本段不执行；改 true 一键启用预览模式）
    // 设计意图：体验版/真机未配 request 合法域名时，让 UI 仍能预览显示
    // 启用步骤：把顶部 USE_MOCK_DATA 改 true，无需改其他代码
    if (USE_MOCK_DATA) {
      const m = getMock(module, action);
      if (m !== undefined) {
        return m as T;
      }
    }

    const url = `${getBaseUrl()}${actionUrl(module, action)}`;
    const token = wx.getStorageSync('accessToken');

    const res = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult>((resolve, reject) => {
      wx.request({
        url,
        method: 'POST',
        data: { action, payload } satisfies ActionRequest,
        header: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        success: resolve,
        fail: (err) => {
          console.error('[api] request FAIL url=', url, err);
          reject(err);
        },
      });
    });

    const body = res.data as ApiResponse<T>;

    if (body.code === 0) {
      // ApiSuccess 分支：data 一定存在
      return (body as { data: T }).data;
    }

    // 401 → 刷新一次后重试。并发 401 共享同一个 refreshing promise，避免重复刷新；
    // retried 标记保证最多重试一次，token 持续失效时不会无限递归。
    if (body.code === 401 && !retried) {
      if (!refreshing) {
        refreshing = this.refreshToken().finally(() => {
          refreshing = null;
        });
      }
      try {
        await refreshing;
      } catch {
        // refresh 失败 → 跳首页（无独立登录页）
        wx.reLaunch({ url: '/pages/index/index' });
        throw new Error('登录已过期，请重新进入');
      }
      return this.call(module, action, payload, true); // 仅重试一次
    }

    // 业务错误统一 toast（body 此时为 ApiError 分支，msg 必有）
    const errMsg = (body as { msg: string }).msg ?? '请求失败';
    wx.showToast({ title: errMsg, icon: 'none' });
    throw new Error(errMsg);
  },

  async refreshToken(): Promise<void> {
    const refreshToken = wx.getStorageSync('refreshToken');
    if (!refreshToken) throw new Error('no refresh token');

    const res = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult>((resolve, reject) => {
      wx.request({
        url: `${getBaseUrl()}${actionUrl('auth', 'refresh')}`,
        method: 'POST',
        data: { refreshToken },
        success: resolve,
        fail: reject,
      });
    });

    const body = res.data as ApiResponse<{ accessToken: string; refreshToken: string }>;
    if (body.code !== 0) {
      throw new Error((body as { msg: string }).msg ?? 'refresh failed');
    }
    const data = (body as { data: { accessToken: string; refreshToken: string } }).data;
    wx.setStorageSync('accessToken', data.accessToken);
    wx.setStorageSync('refreshToken', data.refreshToken);
  },

  /**
   * 上传文件（multipart）
   * @param tempFilePath wx.chooseMedia / chooseAvatar 返回的 tempFilePath
   * @returns 公开 URL
   */
  async uploadFile(tempFilePath: string, type: 'avatar' | 'image' = 'image'): Promise<string> {
    const token = wx.getStorageSync('accessToken');
    const res = await new Promise<WechatMiniprogram.UploadFileSuccessCallbackResult>(
      (resolve, reject) => {
        wx.uploadFile({
          url: `${getBaseUrl()}/api/upload?type=${type}`,
          filePath: tempFilePath,
          name: 'file',
          header: token ? { authorization: `Bearer ${token}` } : {},
          success: resolve,
          fail: reject,
        });
      },
    );

    // wx.uploadFile 的 data 是 string，需要 parse
    const body = JSON.parse(res.data) as ApiResponse<{ url: string }>;
    if (body.code !== 0) {
      throw new Error((body as { msg: string }).msg ?? 'upload failed');
    }
    // V0.1.40：拼完整 URL（upload 返相对 /uploads/，小程序 image 需完整 https URL）
    const relativeUrl = (body as { data: { url: string } }).data.url;
    return `${getBaseUrl()}${relativeUrl}`;
  },
};

/** 便捷：当前登录用户（弱类型，业务里 type narrow） */
export async function getCurrentUser(): Promise<User | null> {
  const cached = wx.getStorageSync('currentUser');
  return (cached as User | null) ?? null;
}
