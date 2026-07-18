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
