/**
 * device module service — STUB
 *
 * Phase 6 实现：
 * - listBindings：列出当前用户已绑定的设备
 * - startOAuth：生成厂商 OAuth 授权链接（小程序→web-view 或二维码）
 * - unbind：解绑
 * - syncWeRun：同步微信运动步数（按日聚合）
 * - submitHeartRate：BLE 实时心率采样（从打卡携带）
 *
 * 前置：
 * - 备案域名 + HTTPS
 * - 各厂商企业开发者账号（华为/佳明/小米/荣耀）
 * - AES 密钥（用于 token 加密存储）
 */
import { Errors } from '../../common/errors.js';
import type { StartOAuthInput, SyncWeRunInput } from './device.schema.js';

export const deviceService = {
  /** 列出当前用户的设备绑定 */
  async listBindings(_userId: string) {
    // TODO Phase 6: 查 device_bindings
    return {
      bindings: [
        // 占位返回空
      ],
    };
  },

  /**
   * 发起厂商 OAuth
   *
   * 流程：生成 state (含 openid + nonce + 5 分钟过期) → 返回授权 URL
   * 小程序展示二维码 / 复制链接，用户浏览器授权后回调 /oauth/callback
   */
  async startOAuth(_userId: string, _input: StartOAuthInput) {
    // TODO Phase 6
    throw Errors.notImplemented('startOAuth');
  },

  /** 解绑 */
  async unbind(_userId: string, _vendor: string) {
    // TODO Phase 6
    throw Errors.notImplemented('unbind');
  },

  /**
   * 同步微信运动（30 天步数）
   *
   * 数据来源：前端 wx.getWeRunData() → 后端解密
   * 用途：步数榜 / 兜底活跃数据
   */
  async syncWeRun(_userId: string, _input: SyncWeRunInput) {
    // TODO Phase 6: upsert raw_activities(vendor:werun, ...)
    return { ok: true, synced: _input.stepList.length };
  },

  /**
   * 提交 BLE 实时心率采样（打卡时由前端 BLE-HRM manager 携带）
   * 实际写入 checkins 关联的元数据；service 这里只做记录/统计
   */
  async submitHeartRate(_userId: string, _samples: unknown) {
    // TODO Phase 6
    throw Errors.notImplemented('submitHeartRate');
  },
};
