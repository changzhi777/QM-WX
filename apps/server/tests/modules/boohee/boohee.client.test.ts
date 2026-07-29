/**
 * boohee client 单测（V0.3.35）
 * mock env + global fetch，验证 X-Api-Key 认证 + envelope 解包 + 错误处理
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/config/env.js', () => ({
  env: {
    BOOHEE_API_KEY: 'sk-test-key-12345',
    BOOHEE_BASE_URL: 'https://api.boohee.com/open-apis',
  },
}));

import { isBooheeConfigured, booheeGet } from 'src/modules/boohee/boohee.client.js';
import { BusinessError } from 'src/common/errors.js';

describe('boohee.client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('isBooheeConfigured: KEY 存在返 true', () => {
    expect(isBooheeConfigured()).toBe(true);
  });

  it('booheeGet: 成功解包 envelope（code=0 返 data）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, message: '成功', data: { foods: [{ name: '苹果' }] } }),
        { status: 200 },
      ),
    );

    const data = await booheeGet<{ foods: unknown[] }>('/v1/food/search', { keyword: '苹果' });
    expect(data.foods).toHaveLength(1);
    expect(data.foods[0]).toEqual({ name: '苹果' });

    // 验证 X-Api-Key header
    const calledUrl = fetchSpy.mock.calls[0][0];
    const calledOpts = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(String(calledUrl)).toContain('keyword=');
    expect((calledOpts.headers as Record<string, string>)['X-Api-Key']).toBe('sk-test-key-12345');
  });

  it('booheeGet: code≠0 抛 badRequest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ code: 1001, message: '参数错误', data: null }),
        { status: 200 },
      ),
    );

    try {
      await booheeGet('/v1/food/search', { keyword: 'x' });
      expect.fail('应该抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessError);
      expect((e as BusinessError).code).toBe(400);
    }
  });

  it('booheeGet: HTTP 非 200 抛 badRequest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Server Error', { status: 500 }),
    );

    await expect(booheeGet('/v1/food/search')).rejects.toThrow('HTTP 500');
  });

  it('booheeGet: params 过滤 undefined/空字符串', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: 'ok', data: {} }), { status: 200 }),
    );

    await booheeGet('/v1/food/search', { keyword: '苹果', sort: undefined, page: '' });
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('keyword=');
    expect(calledUrl).not.toContain('sort=');
    expect(calledUrl).not.toContain('page=');
  });
});
