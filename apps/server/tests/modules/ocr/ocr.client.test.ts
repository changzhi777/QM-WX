/**
 * ocr.client 单测 — V0.2.1（SDK 单例 + key 配置守卫）
 *
 * mock tencentcloud-sdk-nodejs-ocr 的 ocr.v20181119.Client，验证：
 * - isOcrConfigured（key 齐全 / 缺失）
 * - getOcrClient 单例（credential + region + profile）/ 未配置抛错
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    COS_SECRET_ID: 'AKIDxxx' as string | undefined,
    COS_SECRET_KEY: 'skey' as string | undefined,
    COS_REGION: 'ap-guangzhou',
  },
  Client: vi.fn(),
}));

vi.mock('src/config/env.js', () => ({ env: mocks.env }));
vi.mock('tencentcloud-sdk-nodejs-ocr', () => ({
  ocr: { v20181119: { Client: mocks.Client } },
}));

import { getOcrClient, isOcrConfigured, __resetOcrClientForTest } from 'src/modules/ocr/ocr.client.js';

beforeEach(() => {
  vi.clearAllMocks();
  __resetOcrClientForTest();
  mocks.env.COS_SECRET_ID = 'AKIDxxx';
  mocks.env.COS_SECRET_KEY = 'skey';
});

describe('ocr.client', () => {
  it('isOcrConfigured: key 齐全 → true', () => {
    expect(isOcrConfigured()).toBe(true);
  });

  it('isOcrConfigured: 缺 SECRET_ID → false', () => {
    mocks.env.COS_SECRET_ID = undefined;
    expect(isOcrConfigured()).toBe(false);
  });

  it('getOcrClient: 首次创建（credential + region + signMethod）', () => {
    getOcrClient();
    expect(mocks.Client).toHaveBeenCalledWith({
      credential: { secretId: 'AKIDxxx', secretKey: 'skey' },
      region: 'ap-guangzhou',
      profile: expect.objectContaining({ signMethod: 'HmacSHA256' }),
    });
  });

  it('getOcrClient: 单例（第二次不新建 Client）', () => {
    getOcrClient();
    getOcrClient();
    expect(mocks.Client).toHaveBeenCalledTimes(1);
  });

  it('getOcrClient: 未配置 → throw', () => {
    mocks.env.COS_SECRET_ID = undefined;
    expect(() => getOcrClient()).toThrow('OCR 未配置');
  });
});
