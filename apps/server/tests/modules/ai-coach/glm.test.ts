/**
 * GLMProvider 单测（V0.1.139 AI 私教，智谱 v4 API）
 *
 * mock 全局 fetch，覆盖：chat 非流式 / chatStream SSE 解析 / generatePlan json_object + zod 校验
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch as never);

import { glmProvider } from 'src/modules/ai-coach/providers/glm.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LLM_API_KEY = 'test.id_secret';
  process.env.LLM_MODEL = 'glm-4.7';
  process.env.LLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
});

describe('glmProvider.chat (V0.1.139 非流式)', () => {
  it('返 choices[0].message.content', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '你好，跑者' } }] }),
    });
    const r = await glmProvider.chat([{ role: 'user', content: 'hi' }], 'sys-prompt');
    expect(r).toBe('你好，跑者');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test.id_secret' }),
      }),
    );
  });

  it('API 非 2xx → throw 含状态码', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid api key' });
    await expect(glmProvider.chat([{ role: 'user', content: 'x' }], 'sys')).rejects.toThrow(
      /GLM API 401/,
    );
  });
});

describe('glmProvider.chatStream (V0.1.139 SSE 解析)', () => {
  it('逐 chunk 解析 delta.content，跳过 [DONE]', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const encoder = new TextEncoder();
    let i = 0;
    mockFetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () =>
            i < frames.length
              ? { done: false, value: encoder.encode(frames[i++]) }
              : { done: true, value: undefined },
        }),
      },
    });

    const tokens: string[] = [];
    for await (const t of glmProvider.chatStream([{ role: 'user', content: 'hi' }], 'sys')) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['你', '好']);
  });

  it('跨 chunk 的 SSE 帧（buffer 拼接）也能解析', async () => {
    // 一帧被拆到两个 chunk
    const encoder = new TextEncoder();
    const seq = [
      encoder.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n'),
      encoder.encode('\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\n'),
    ];
    let i = 0;
    mockFetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () =>
            i < seq.length ? { done: false, value: seq[i++] } : { done: true, value: undefined },
        }),
      },
    });
    const tokens: string[] = [];
    for await (const t of glmProvider.chatStream([{ role: 'user', content: 'x' }], 'sys')) {
      tokens.push(t);
    }
    expect(tokens).toEqual(['A', 'B']);
  });
});

describe('glmProvider.generatePlan (V0.1.139 json_object + zod)', () => {
  const validPlan = {
    title: '5K 入门',
    level: 'beginner',
    weeks: 8,
    goal: '完成首个 5K',
    weeklyMileage: '约 15km/周',
    targetKm: 120,
    days: [{ day: '周一', type: 'easy', content: '轻松跑 3km', distanceKm: 3 }],
  };

  it('合法 JSON → 返 plan', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(validPlan) } }] }),
    });
    const r = await glmProvider.generatePlan([{ role: 'user', content: '计划' }], 'sys');
    expect(r.title).toBe('5K 入门');
    expect(r.level).toBe('beginner');
  });

  it('格式不符（缺字段）→ throw', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    await expect(glmProvider.generatePlan([{ role: 'user', content: 'x' }], 'sys')).rejects.toThrow(
      /格式不符合/,
    );
  });
});
