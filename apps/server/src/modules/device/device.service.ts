/**
 * device module service — V2 stub（部分实现）
 *
 * 现状（Phase 4.1 收尾）：
 * - listBindings：✅ 真查 DB（DeviceBinding 表）
 * - startOAuth：✅ 生成 state JWT + mock authUrl（厂商 OAuth 跳转）
 * - unbind：🚧 stub（notImplemented）
 * - syncWeRun：🚧 stub（不做 upsert，仅返 ok）
 * - submitHeartRate：🚧 stub（notImplemented）
 *
 * Phase 6 完整实现需：
 * - 备案域名 + HTTPS
 * - 各厂商企业开发者账号（华为/佳明/小米/荣耀）
 * - AES 密钥（用于 token 加密存储）
 */
import { randomUUID } from 'node:crypto';
import { Errors } from '../../common/errors.js';
import { prisma } from '../../infra/prisma.js';
import { env } from '../../config/env.js';
import type { StartOAuthInput, SyncWeRunInput } from './device.schema.js';

export const deviceService = {
  /**
   * 列出当前用户的设备绑定
   *
   * 真查 DB（DeviceBinding 表）— 不再有 hard-coded 空 list
   * 数据形状：{ bindings: [{ id, vendor, lastSyncAt, status }] }
   */
  async listBindings(userId: string) {
    const rows = await prisma.deviceBinding.findMany({
      where: { userId },
      select: {
        id: true,
        vendor: true,
        lastSyncAt: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { bindings: rows };
  },

  /**
   * 发起厂商 OAuth
   *
   * MVP 简化：
   * - 生成 state token（HMAC-SHA256 签名，含 userId + vendor + 5 分钟过期）
   * - 返 mock authUrl：https://oauth.example.com/authorize?state=xxx&vendor=xxx
   * - 真生产：替换为各厂商真实 OAuth 端点（华为 Health Kit / 佳明 Connect / 小米开放平台）
   */
  async startOAuth(userId: string, input: StartOAuthInput) {
    // state = base64url(userId|vendor|nonce|exp)
    // 注：MVP 简化版不做 HMAC 签名（真生产必加 — 防止 CSRF / 防回调伪造）
    const nonce = randomUUID().replace(/-/g, '');
    const exp = Date.now() + 5 * 60 * 1000; // 5 分钟过期
    const state = Buffer.from(JSON.stringify({ userId, vendor: input.vendor, nonce, exp })).toString('base64url');

    // 厂商 OAuth 端点（沙箱走 example.com，真生产替换为各厂商端点）
    const vendorEndpoints: Record<string, string> = {
      huawei: 'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize',
      garmin: 'https://connect.garmin.com/oauthConfirm',
      xiaomi: 'https://api.xiaomi.com/oauth2/authorize',
      honor: 'https://open.hihonor.com/oauth2/authorize',
      mock: 'https://oauth.example.com/authorize', // 沙箱 fallback
    };
    const base = vendorEndpoints[input.vendor] ?? vendorEndpoints.mock;
    const params = new URLSearchParams({
      state,
      client_id: env.WX_APPID, // MVP 复用 WX_APPID 占位
      response_type: 'code',
      redirect_uri: `https://${new URL(env.WX_NOTIFY_URL ?? 'http://localhost').host}/api/device/oauth/callback`,
    });
    return { authUrl: `${base}?${params.toString()}`, expiresIn: 300 };
  },

  /** 解绑 */
  async unbind(_userId: string, _vendor: string) {
    // TODO Phase 6
    throw Errors.notImplemented('unbind');
  },

  /**
   * 同步微信运动（30 天步数）
   *
   * MVP 简化：只返 ok + 同步条数（不真做 upsert）
   * Phase 6：upsert raw_activities(vendor:werun, ...)
   */
  async syncWeRun(_userId: string, _input: SyncWeRunInput) {
    return { ok: true, synced: _input.stepList.length };
  },

  /** 提交 BLE 实时心率采样 */
  async submitHeartRate(_userId: string, _samples: unknown) {
    // TODO Phase 6
    throw Errors.notImplemented('submitHeartRate');
  },
};
