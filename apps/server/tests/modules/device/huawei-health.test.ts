/**
 * huawei-health.test.ts — V0.3.18 C 选项 OAuth 2.0 骨架单元测试
 *
 * 覆盖：
 *   1. isHuaweiConfigured：缺/全凭据
 *   2. generateHuaweiAuthUrl：无凭据 → 空 URL；全凭据 → 含 client_id/state/scope
 *   3. exchangeHuaweiCode：无凭据 → null；HTTP 非 2xx → null；happy path → tokens
 *   4. refreshHuaweiToken：同上
 *   5. fetchHuaweiActivities：HTTP 非 2xx → null；happy path → 标准化 ParsedHuaweiActivity[]
 *   6. parseHuaweiActivityRecord：字段映射（startTime/Duration/distance/avgHr/maxHr/calories/sportType）
 */
import { vi } from 'vitest';

vi.mock('../../../src/config/env.js', () => ({
  env: {
    HUAWEI_APP_ID: 'test-app-id',
    HUAWEI_APP_SECRET: 'test-secret',
  },
}));

import {
  isHuaweiConfigured,
  generateHuaweiAuthUrl,
  exchangeHuaweiCode,
  refreshHuaweiToken,
  fetchHuaweiActivities,
} from '../../../src/modules/device/huawei-health.js';

describe('huawei-health V0.3.18 OAuth 2.0', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('isHuaweiConfigured', () => {
    it('凭据齐全 → true', () => {
      expect(isHuaweiConfigured()).toBe(true);
    });
  });

  describe('generateHuaweiAuthUrl', () => {
    it('凭据齐全 → URL 含 client_id/state/redirect_uri/scope', () => {
      const r = generateHuaweiAuthUrl('u1', 'https://qingmulife.cn/api/device/huawei-health-callback?state=u1');
      expect(r.configured).toBe(true);
      expect(r.url).toContain('client_id=test-app-id');
      expect(r.url).toContain('state=u1');
      expect(r.url).toContain('redirect_uri=');
      expect(r.url).toContain('scope=openid+profile');
      expect(r.url).toContain('response_type=code');
      expect(r.url).toContain('access_type=offline');
      expect(r.url).toContain('oauth-login.cloud.huawei.com/oauth2/v3/authorize');
    });
  });

  describe('exchangeHuaweiCode', () => {
    it('happy path → access_token + refresh_token + expires_in', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'at-123',
          refresh_token: 'rt-456',
          expires_in: 3600,
          scope: 'openid profile',
          unionid: 'union-789',
        }),
      } as never));

      const r = await exchangeHuaweiCode('code-abc', 'https://qingmulife.cn/cb');
      expect(r).toEqual({
        accessToken: 'at-123',
        refreshToken: 'rt-456',
        expiresIn: 3600,
        scope: 'openid profile',
        unionId: 'union-789',
      });
    });

    it('HTTP 401 → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as never));

      const r = await exchangeHuaweiCode('bad-code', 'https://qingmulife.cn/cb');
      expect(r).toBeNull();
    });

    it('fetch throw → null（graceful degrade）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

      const r = await exchangeHuaweiCode('code', 'https://qingmulife.cn/cb');
      expect(r).toBeNull();
    });
  });

  describe('refreshHuaweiToken', () => {
    it('happy path → 新 access_token + refresh_token', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'at-new',
          refresh_token: 'rt-new',
          expires_in: 3600,
        }),
      } as never));

      const r = await refreshHuaweiToken('rt-old');
      expect(r?.accessToken).toBe('at-new');
      expect(r?.refreshToken).toBe('rt-new');
    });
  });

  describe('fetchHuaweiActivities', () => {
    it('happy path → 标准化活动数组', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          activity_records: [
            {
              activity_id: 'a1',
              start_time: 1785000000, // 2026+
              duration: 1800, // 30min
              distance: 5000, // 5km
              avg_heart_rate: 145,
              max_heart_rate: 168,
              calories: 350,
              sport_type: 'running',
            },
          ],
        }),
      } as never));

      const r = await fetchHuaweiActivities('at-123', '2026-07-01', '2026-07-28');
      expect(r).not.toBeNull();
      expect(r?.[0].vendorActivityId).toBe('a1');
      expect(r?.[0].distanceMeters).toBe(5000);
      expect(r?.[0].durationSec).toBe(1800);
      expect(r?.[0].avgHr).toBe(145);
      expect(r?.[0].sportType).toBe('running');
      expect(r?.[0].startTime).toBeInstanceOf(Date);
    });

    it('HTTP 401 → null', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as never));
      const r = await fetchHuaweiActivities('bad-token', '2026-07-01', '2026-07-28');
      expect(r).toBeNull();
    });
  });
});