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

import { callMinimax, isMinimaxConfigured, callGlmVision, isGlmVisionConfigured } from 'src/modules/interpret/client.js';

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

  it('P0: fetch reject（网络错误）抛', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(callMinimax('s', [{ role: 'user', content: 'd' }])).rejects.toThrow(/network down/);
  });

  it('P0: empty content（无 text block）返空串不崩', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [], usage: { input_tokens: 5 } }), { status: 200 }),
    );
    const r = await callMinimax('s', [{ role: 'user', content: 'd' }]);
    expect(r.content).toBe('');
    expect(r.inputTokens).toBe(5);
    expect(r.outputTokens).toBe(0);
  });

  it('P1: max_tokens 透传到 body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }], usage: {} }), { status: 200 }),
    );
    await callMinimax('s', [{ role: 'user', content: 'd' }], { maxTokens: 4096 });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBe(4096);
  });

  it('P1: usage 缺失默认 tokens=0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'x' }] }), { status: 200 }),
    );
    const r = await callMinimax('s', [{ role: 'user', content: 'd' }]);
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(0);
  });
});

// ===== V0.2.57 GLM-4.6V vision（screenshot action）=====

describe('GLM-4.6V vision client (V0.2.57 screenshot)', () => {
  it('isGlmVisionConfigured: LLM_API_KEY 配置返 true / 空返 false', () => {
    vi.stubEnv('LLM_API_KEY', 'glm-key');
    expect(isGlmVisionConfigured()).toBe(true);
    vi.stubEnv('LLM_API_KEY', '');
    expect(isGlmVisionConfigured()).toBe(false);
  });

  it('callGlmVision: GLM 协议（Bearer + /chat/completions + ContentPart[] + response_format）', async () => {
    vi.stubEnv('LLM_API_KEY', 'glm-key');
    vi.stubEnv('LLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4');
    vi.stubEnv('LLM_VISION_MODEL', 'glm-4.6v');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '识图结果' } }],
          usage: { prompt_tokens: 50, completion_tokens: 100 },
        }),
        { status: 200 },
      ),
    );
    const r = await callGlmVision('sys', '识别这张图', 'https://cdn/x.jpg', { responseFormatJson: true });

    expect(r.content).toBe('识图结果');
    expect(r.inputTokens).toBe(50);
    expect(r.outputTokens).toBe(100);
    expect(r.model).toBe('glm-4.6v');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer glm-key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('glm-4.6v');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // user content 是 ContentPart[]（text + image_url，GLM-4.6V vision 格式）
    const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toEqual([
      { type: 'text', text: '识别这张图' },
      { type: 'image_url', image_url: { url: 'https://cdn/x.jpg' } },
    ]);
  });

  it('callGlmVision: 未配 LLM_API_KEY 抛错', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    await expect(callGlmVision('s', 't', 'url')).rejects.toThrow(/LLM_API_KEY 未配置/);
  });

  it('callGlmVision: API 非 2xx 抛带 status', async () => {
    vi.stubEnv('LLM_API_KEY', 'glm-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    await expect(callGlmVision('s', 't', 'url')).rejects.toThrow(/500/);
  });
});
