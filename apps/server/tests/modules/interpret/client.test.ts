/**
 * minimax client 单测（V0.2.33）
 * mock env + global fetch，验证 Anthropic 兼容协议（x-api-key + /v1/messages + 响应解析）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/config/env.js', () => ({
  env: {
    MINIMAX_API_KEY: 'sk-test-key',
    MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic',
    MINIMAX_MODEL: 'MiniMax-M3',
  },
}));

import { callMinimax, isMinimaxConfigured } from 'src/modules/interpret/client.js';

beforeEach(() => vi.clearAllMocks());

describe('minimax client (V0.2.33 Anthropic 兼容)', () => {
  it('isMinimaxConfigured: key 配置返 true', () => {
    expect(isMinimaxConfigured()).toBe(true);
  });

  it('callMinimax: Anthropic 兼容协议（x-api-key + anthropic-version + /v1/messages）', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '解读结果' }],
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
        { status: 200 },
      ),
    );
    const result = await callMinimax('系统提示', [{ role: 'user', content: '数据' }]);

    expect(result.content).toBe('解读结果');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
    expect(result.model).toBe('MiniMax-M3');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.minimaxi.com/anthropic/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('MiniMax-M3');
    expect(body.system).toBe('系统提示');
    expect(body.messages[0]).toEqual({ role: 'user', content: '数据' });
  });

  it('callMinimax: API 非 2xx 抛带 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    await expect(callMinimax('sys', [{ role: 'user', content: 'x' }])).rejects.toThrow(/401/);
  });

  it('callMinimax: 多个 text content block 拼接', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: '段1' },
            { type: 'text', text: '段2' },
          ],
          usage: {},
        }),
        { status: 200 },
      ),
    );
    const r = await callMinimax('s', [{ role: 'user', content: 'd' }]);
    expect(r.content).toBe('段1段2');
  });
});
