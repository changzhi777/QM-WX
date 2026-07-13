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

/** 对话消息（OpenAI chat 格式） */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
