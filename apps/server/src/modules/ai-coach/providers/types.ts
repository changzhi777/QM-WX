/**
 * LLM Provider 抽象（V0.1.139 AI 私教）
 *
 * 双轨策略（feature_flags.ai + LLM_API_KEY 切换）：
 * - StubProvider：规则话术占位（ai=off 或未配 API key）
 * - OpenAICompatibleProvider：真模型（OpenAI 兼容 baseURL 通吃通义/智谱/DeepSeek）
 *
 * 三方法：chat（非流式兜底）/ chatStream（流式打字机）/ generatePlan（结构化 JSON）
 */
import type { PlanStructure } from '../ai-coach.schema.js';

/** 多模态消息内容段（OpenAI vision 格式，GLM-4.6V 兼容）V0.2.45 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** 对话消息（OpenAI chat 格式；V0.2.45 content 扩多模态：string=纯文本，ContentPart[]=带图） */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

/** V0.2.45 从 message content 提取纯文本（stub 关键词匹配 + 落库用，数组取 text 段拼接） */
export function extractText(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join(' ');
}

/** V0.2.45 检测消息序列是否含图片（含图切 vision 模型） */
export function hasImage(messages: ChatMessage[]): boolean {
  return messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
}

/** LLM Provider 接口（Stub + GLM 双实现） */
export interface LLMProvider {
  /** 非流式对话（兜底，返回完整回复） */
  chat(messages: ChatMessage[], systemPrompt: string): Promise<string>;

  /** 流式对话（逐 token yield，前端打字机效果） */
  chatStream(messages: ChatMessage[], systemPrompt: string): AsyncIterable<string>;

  /** 生成结构化训练计划（JSON） */
  generatePlan(messages: ChatMessage[], systemPrompt: string): Promise<PlanStructure>;
}
