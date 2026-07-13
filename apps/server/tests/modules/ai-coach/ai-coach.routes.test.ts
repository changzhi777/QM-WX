/**
 * ai-coach routes 路由层测试（V0.1.139 AI 私教）
 *
 * 覆盖：鉴权 / unknown action 400 / chat 透传 / generatePlan 空 payload / adoptPlan 取 input.plan /
 *      chatStream 调 service（service 内部 hijack，route 层只验证转发）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockAiCoachService = vi.hoisted(() => ({
  chat: vi.fn(),
  chatStream: vi.fn(),
  generatePlan: vi.fn(),
  adoptPlan: vi.fn(),
  history: vi.fn(),
  regenerate: vi.fn(),
  conversations: vi.fn(),
  deleteConversation: vi.fn(),
  setPersona: vi.fn(),
}));

vi.mock('src/modules/ai-coach/ai-coach.service.js', () => ({ aiCoachService: mockAiCoachService }));
vi.mock('src/modules/ai-coach/ai-coach.schema.js', () => {
  const passthrough = { parse: (v: unknown) => v };
  return {
    ChatInputSchema: passthrough,
    GeneratePlanInputSchema: passthrough,
    AdoptPlanInputSchema: passthrough,
    HistoryQuerySchema: passthrough,
    RegenerateInputSchema: passthrough,
    DeleteConversationInputSchema: passthrough,
    SetPersonaInputSchema: passthrough,
  };
});
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401 }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400 }),
    notFound: (msg: string) => Object.assign(new Error(msg), { code: 404, statusCode: 404 }),
    forbidden: () => Object.assign(new Error('forbidden'), { code: 403, statusCode: 403 }),
  },
}));
// V0.1.140 限流用 redis
const mockRedis = vi.hoisted(() => ({ incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) }));
vi.mock('src/infra/redis.js', () => ({ redis: mockRedis }));

import { aiCoachRoutes } from '../../../src/modules/ai-coach/ai-coach.routes.js';

interface MockUser { id: string; openid: string; sub: string }

async function buildApp(authed = true) {
  const app = Fastify();
  app.decorateRequest('user', undefined);
  if (authed) {
    app.addHook('onRequest', async (req) => {
      (req as { user?: MockUser }).user = { id: 'u1', openid: 'oU1', sub: 'u1' };
    });
  }
  await app.register(aiCoachRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('ai-coach routes (V0.1.139)', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp(false);
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'chat' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('unknown action → 400', async () => {
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'unknown' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().msg).toContain('unknown action');
    await app.close();
  });

  it('chat → 透传 userId + input', async () => {
    mockAiCoachService.chat.mockResolvedValue({ reply: 'hi', conversationId: 'c1' });
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'chat', payload: { message: '你好', conversationId: 'c1' } },
    });
    expect(r.json().data).toEqual({ reply: 'hi', conversationId: 'c1' });
    expect(mockAiCoachService.chat).toHaveBeenCalledWith('u1', { message: '你好', conversationId: 'c1' });
    await app.close();
  });

  it('generatePlan → 空 payload 兜底 {}', async () => {
    mockAiCoachService.generatePlan.mockResolvedValue({ plan: { title: 't' } });
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/', payload: { action: 'generatePlan' } });
    expect(mockAiCoachService.generatePlan).toHaveBeenCalledWith('u1', {});
    await app.close();
  });

  it('adoptPlan → 取 input.plan 传 service', async () => {
    mockAiCoachService.adoptPlan.mockResolvedValue({ planId: 'p1' });
    const app = await buildApp();
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'adoptPlan', payload: { plan: { title: '5K', level: 'beginner' } } },
    });
    expect(mockAiCoachService.adoptPlan).toHaveBeenCalledWith('u1', { title: '5K', level: 'beginner' });
    await app.close();
  });

  it('chatStream → 调 service.chatStream（传 userId + input + reply）', async () => {
    // mock service 完成 SSE 流（hijack + end），避免 inject 等响应超时
    mockAiCoachService.chatStream.mockImplementation(async (_u: string, _i: unknown, reply: { hijack: () => void; raw: { writeHead: (code: number, headers: Record<string, string>) => void; write: (s: string) => void; end: () => void } }) => {
      reply.hijack();
      reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream' });
      reply.raw.write('data: {"done":true}\n\n');
      reply.raw.end();
    });
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'chatStream', payload: { message: 'hi' } },
    });
    expect(mockAiCoachService.chatStream).toHaveBeenCalledWith(
      'u1',
      { message: 'hi' },
      expect.anything(), // reply 对象
    );
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it('history → 空 payload 兜底 {}', async () => {
    mockAiCoachService.history.mockResolvedValue({ conversationId: 'c1', messages: [] });
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/', payload: { action: 'history' } });
    expect(mockAiCoachService.history).toHaveBeenCalledWith('u1', {});
    await app.close();
  });

  it('regenerate → 透传 conversationId', async () => {
    mockAiCoachService.regenerate.mockResolvedValue({ reply: '新回复', conversationId: 'c1' });
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'regenerate', payload: { conversationId: 'c1' } },
    });
    expect(r.json().data.reply).toBe('新回复');
    expect(mockAiCoachService.regenerate).toHaveBeenCalledWith('u1', { conversationId: 'c1' });
    await app.close();
  });

  it('conversations → 无参调 service', async () => {
    mockAiCoachService.conversations.mockResolvedValue({ conversations: [] });
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'conversations' } });
    expect(r.json().data).toEqual({ conversations: [] });
    expect(mockAiCoachService.conversations).toHaveBeenCalledWith('u1');
    await app.close();
  });

  it('deleteConversation → 透传 conversationId', async () => {
    mockAiCoachService.deleteConversation.mockResolvedValue({ ok: true });
    const app = await buildApp();
    await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'deleteConversation', payload: { conversationId: 'c1' } },
    });
    expect(mockAiCoachService.deleteConversation).toHaveBeenCalledWith('u1', { conversationId: 'c1' });
    await app.close();
  });

  it('setPersona → 透传 persona（V0.1.140 A）', async () => {
    mockAiCoachService.setPersona.mockResolvedValue({ persona: 'strict' });
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'setPersona', payload: { persona: 'strict' } },
    });
    expect(r.json().data.persona).toBe('strict');
    expect(mockAiCoachService.setPersona).toHaveBeenCalledWith('u1', { persona: 'strict' });
    await app.close();
  });

  it('限流：chat 超 30/分 → 429（V0.1.140 E）', async () => {
    mockRedis.incr.mockResolvedValue(31);
    const app = await buildApp();
    const r = await app.inject({
      method: 'POST', url: '/',
      payload: { action: 'chat', payload: { message: 'hi' } },
    });
    expect(r.statusCode).toBe(429);
    expect(mockAiCoachService.chat).not.toHaveBeenCalled();
    await app.close();
  });

  it('限流：history 非 LLM action 不受限', async () => {
    mockRedis.incr.mockResolvedValue(100);
    mockAiCoachService.history.mockResolvedValue({ conversationId: '', messages: [] });
    const app = await buildApp();
    const r = await app.inject({ method: 'POST', url: '/', payload: { action: 'history' } });
    expect(r.statusCode).toBe(200);
    expect(mockAiCoachService.history).toHaveBeenCalled();
    await app.close();
  });
});
