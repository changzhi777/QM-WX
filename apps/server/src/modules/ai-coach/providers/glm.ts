/**
 * GLM Provider — 智谱 GLM 大模型（V0.1.139 AI 私教）
 *
 * 协议：智谱开放平台 v4 API
 *   - endpoint：POST https://open.bigmodel.cn/api/paas/v4/chat/completions
 *   - 鉴权：Authorization: Bearer {LLM_API_KEY}（key 格式 {id}.{secret}，直接作 Bearer，无需 JWT）
 *   - 请求：{ model, messages:[{role,content}], stream?, temperature?, response_format? }
 *   - 流式：stream=true → SSE，data: {"choices":[{"delta":{"content":"..."}}]}\n\n，结束 data: [DONE]
 *   - 结构化：response_format {type:"json_object"}（智谱 json_schema strict 支持不稳，统一 json_object + zod 校验）
 *
 * 模型（GLM Coding Plan 套餐）：glm-4.7（推荐）/ glm-4.6 / glm-4.5 / glm-4-plus / glm-4-air / glm-4-flash
 * env：LLM_BASE_URL（默认智谱）/ LLM_API_KEY / LLM_MODEL（默认 glm-4.7）
 *
 * 启用条件：LLM_API_KEY 已配（service 层切换，本 provider 假定已配）
 * 实现：原生 fetch + ReadableStream（Node 18+ 全局），不依赖任何第三方 LLM SDK
 */
import type { ChatMessage, LLMProvider } from './types.js';
import { PlanStructureSchema, type PlanStructure } from '../ai-coach.schema.js';

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4.7';

function baseUrl(): string {
  return process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
}
function apiKey(): string {
  return process.env.LLM_API_KEY || '';
}
function model(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

interface GlmChoice {
  delta?: { content?: string };
  message?: { content?: string };
  finish_reason?: string;
}
interface GlmChunk {
  choices?: GlmChoice[];
}

const PLAN_INSTRUCTION =
  '请根据用户的跑者画像和需求，生成一份个性化周训练计划。必须返回 JSON，字段：title（计划名）、level（beginner|intermediate|challenge|extreme）、weeks（周数 1-52）、goal（目标）、weeklyMileage（周跑量描述）、targetKm（总目标跑量，进度计算分母）、days（长度 7 的数组，每个含 day（周一~周日）、type（easy|interval|long|rest|tempo|cross）、content（训练内容）、distanceKm（建议跑量，可选））。计划要结合用户当前跑量、目标、跑鞋状态个性化。';

async function postChat(body: Record<string, unknown>): Promise<GlmChunk> {
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GLM API ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as GlmChunk;
}

export const glmProvider: LLMProvider = {
  async chat(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    const data = await postChat({
      model: model(),
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });
    return data.choices?.[0]?.message?.content ?? '';
  },

  async *chatStream(messages: ChatMessage[], systemPrompt: string): AsyncIterable<string> {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: model(),
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GLM API ${res.status}: ${detail.slice(0, 200)}`);
    }

    // SSE 解析：按行读 data: {...}，提取 delta.content
    // TextDecoder stream 模式处理跨 chunk 多字节 UTF-8（保留未完成字节到下次）
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // 最后一行可能不完整，留到下次拼接
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload) as GlmChunk;
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch {
          // 跳过非 JSON 行（心跳/注释）
        }
      }
    }
  },

  async generatePlan(messages: ChatMessage[], systemPrompt: string): Promise<PlanStructure> {
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: PLAN_INSTRUCTION },
    ];
    const data = await postChat({
      model: model(),
      messages: fullMessages,
      response_format: { type: 'json_object' },
    });
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = PlanStructureSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new Error('AI 生成的计划格式不符合要求，请重新生成');
    }
    return parsed.data;
  },
};
