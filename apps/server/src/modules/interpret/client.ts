/**
 * MiniMax M3 Provider — Anthropic 兼容协议（V0.2.33 interpret module）
 *
 * 协议：MiniMax 开放平台 Anthropic 兼容端点
 *   - endpoint：POST {MINIMAX_BASE_URL}/v1/messages（默认 https://api.minimaxi.com/anthropic 国内官方）
 *   - 鉴权：x-api-key: {MINIMAX_API_KEY}（Anthropic 风格，非 Bearer）
 *   - header：anthropic-version: 2023-06-01
 *   - 请求：{ model, max_tokens, system, messages:[{role, content}] }
 *   - 响应：{ content:[{type:'text', text}], usage:{input_tokens, output_tokens}, stop_reason }
 *
 * env：MINIMAX_API_KEY / MINIMAX_BASE_URL / MINIMAX_MODEL（默认 MiniMax-M3）
 * 启用条件：MINIMAX_API_KEY 已配（routes 层判断，未配返 503）
 * 实现：原生 fetch（复用 ai-coach glm.ts 范式），不依赖 anthropic SDK
 *
 * 用法：
 *   import { callMinimax } from './client.js';
 *   const { content, inputTokens, outputTokens } = await callMinimax(systemPrompt, [{role:'user', content: dataSummary}]);
 */
import { env } from '../../config/env.js';
import type { ContentPart } from '../ai-coach/providers/types.js';

export interface MinimaxMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MinimaxResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}

/** 是否已配置（routes 层判启用，未配返 503）*/
export function isMinimaxConfigured(): boolean {
  return !!env.MINIMAX_API_KEY;
}

/** 调 MiniMax M3（Anthropic 兼容 /v1/messages，非 streaming MVP）*/
export async function callMinimax(
  system: string,
  messages: MinimaxMessage[],
  opts: { maxTokens?: number } = {},
): Promise<MinimaxResult> {
  if (!env.MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  const res = await fetch(`${env.MINIMAX_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.MINIMAX_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.MINIMAX_MODEL,
      max_tokens: opts.maxTokens ?? 2048,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`MiniMax API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as AnthropicResponse;
  const content = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return {
    content,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    model: env.MINIMAX_MODEL,
  };
}

// ===== V0.2.57 screenshot：GLM-4.6V 多模态识图（复用 ai-coach V0.2.45 + food.recognize 范式）=====

/**
 * GLM-4.6V 多模态识图 helper（V0.2.57 interpret screenshot action）
 *
 * 协议：智谱 GLM v4 chat/completions（OpenAI 兼容）+ vision content（image_url 段）
 *   - endpoint：POST {LLM_BASE_URL}/chat/completions（默认智谱）
 *   - 鉴权：Authorization: Bearer {LLM_API_KEY}
 *   - messages.user.content = ContentPart[]（text + image_url，GLM-4.6V 兼容 OpenAI vision 格式）
 *
 * 与 minimax（FIT 文本）分工：FIT 走 callMinimax（Anthropic 协议）/ 截图走 callGlmVision（GLM-4.6V）
 * 用 process.env.LLM_*（与 ai-coach glm.ts / food.recognize 一致，非 env.ts Zod）
 */

/** GLM-4.6V 是否已配置（routes 层 screenshot 守卫，未配返 503 featureDisabled）*/
export function isGlmVisionConfigured(): boolean {
  return !!process.env.LLM_API_KEY;
}

/** 调 GLM-4.6V 识图（system + userText + imageUrl → 文本/JSON 内容）*/
export async function callGlmVision(
  system: string,
  userText: string,
  imageUrl: string,
  opts: { maxTokens?: number; responseFormatJson?: boolean } = {},
): Promise<{ content: string; inputTokens: number; outputTokens: number; model: string }> {
  const apiKey = process.env.LLM_API_KEY || '';
  if (!apiKey) throw new Error('LLM_API_KEY 未配置');
  const base = process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
  const visionModel = process.env.LLM_VISION_MODEL || 'glm-4.6v';

  const content: ContentPart[] = [
    { type: 'text', text: userText },
    { type: 'image_url', image_url: { url: imageUrl } },
  ];
  const body: Record<string, unknown> = {
    model: visionModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (opts.responseFormatJson) body.response_format = { type: 'json_object' };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GLM-4.6V API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    model: visionModel,
  };
}
