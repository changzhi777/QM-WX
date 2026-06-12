/**
 * 微信 code2Session 测试
 *
 * 关键路径：
 * - 正常：返回 openid + session_key，写 Redis 缓存
 * - 微信返回 errcode → 抛 badRequest
 * - 微信返回无 openid → 抛 badRequest
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockSetex = vi.fn();
vi.mock('src/infra/redis.js', () => ({
  redis: {
    setex: (...args: unknown[]) => mockSetex(...args),
  },
}));

vi.mock('src/config/env.js', () => ({
  env: {
    WX_APPID: 'wx-test-appid',
    WX_SECRET: 'wx-test-secret',
  },
}));

vi.mock('src/common/errors.js', () => ({
  Errors: {
    badRequest: (msg: string) => {
      const e = new Error(msg) as Error & { code: number; statusCode: number };
      e.code = 400;
      e.statusCode = 400;
      return e;
    },
  },
}));

import { code2Session } from '../../../../src/common/integrations/wx/code2session.js';

describe('code2Session', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSetex.mockReset();
    mockSetex.mockResolvedValue('OK');
  });

  it('正常：返回 openid + 缓存 session_key 到 Redis（TTL 7000s）', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        openid: 'oUser1',
        session_key: 'sk-abc',
        unionid: 'u-1',
      }),
    });

    const result = await code2Session('code-xyz');

    expect(result.openid).toBe('oUser1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('appid=wx-test-appid');
    expect(url).toContain('secret=wx-test-secret');
    expect(url).toContain('js_code=code-xyz');
    expect(url).toContain('grant_type=authorization_code');

    expect(mockSetex).toHaveBeenCalledWith('wx:session:oUser1', 7000, 'sk-abc');
  });

  it('微信返回 errcode → 抛 badRequest', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ errcode: 40029, errmsg: 'invalid code' }),
    });
    await expect(code2Session('bad-code')).rejects.toThrow(/微信登录失败.*invalid code/);
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('微信返回无 openid → 抛 badRequest', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ session_key: 'sk' }),
    });
    await expect(code2Session('c')).rejects.toThrow(/微信登录失败/);
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('fetch 抛错（网络失败/DNS 解析失败）→ 错误冒泡', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(code2Session('c')).rejects.toThrow(/ECONNREFUSED/);
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('微信响应 JSON 解析失败 → 错误冒泡', async () => {
    mockFetch.mockResolvedValue({
      json: async () => {
        throw new Error('Unexpected token');
      },
    });
    await expect(code2Session('c')).rejects.toThrow(/Unexpected token/);
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('Redis setex 失败 → 错误冒泡（缓存失败不应静默）', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ openid: 'o1', session_key: 'sk' }),
    });
    mockSetex.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(code2Session('c')).rejects.toThrow(/Redis connection lost/);
  });
});
