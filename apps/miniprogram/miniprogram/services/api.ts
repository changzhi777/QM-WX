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

const getBaseUrl = (): string =>
  (wx as unknown as { $apiBase?: string }).$apiBase ?? 'http://localhost:3000';

let refreshing: Promise<void> | null = null;

export const api = {
  /**
   * 统一调用入口
   */
  async call<T = unknown>(
    module: keyof typeof ENDPOINTS,
    action: string,
    payload: unknown = {},
  ): Promise<T> {
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
        fail: reject,
      });
    });

    const body = res.data as ApiResponse<T>;

    if (body.code === 0) {
      // ApiSuccess 分支：data 一定存在
      return (body as { data: T }).data;
    }

    // 401 → 尝试 refresh 一次
    if (body.code === 401 && !refreshing) {
      refreshing = this.refreshToken()
        .then(() => {
          refreshing = null;
        })
        .catch(() => {
          refreshing = null;
          // refresh 失败 → 跳首页（无独立登录页）
          wx.reLaunch({ url: '/pages/index/index' });
        });
      await refreshing;
      return this.call(module, action, payload); // 重试一次
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
    return (body as { data: { url: string } }).data.url;
  },
};

/** 便捷：当前登录用户（弱类型，业务里 type narrow） */
export async function getCurrentUser(): Promise<User | null> {
  const cached = wx.getStorageSync('currentUser');
  return (cached as User | null) ?? null;
}
