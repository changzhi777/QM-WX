/**
 * ai-coach service 单测（V0.1.139 AI 私教）
 *
 * 覆盖：chat（多轮记忆 + saveTurns）/ chatStream（reply.hijack + SSE asciiFrame + 流完落库）/
 *      generatePlan（透传 provider）/ adoptPlan（TrainingPlan archived + Enrollment upsert）
 *
 * mock：prisma（conversationTurn/trainingPlan/userPlanEnrollment）+ provider（glm/stub 同一 mock）+ context-builder
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockErrors } from '../../helpers/mockErrors.js';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['conversationTurn', 'trainingPlan', 'userPlanEnrollment', 'user'],
  });
});

// provider mock（glm + stub 都指向同一 mock，pickProvider 选哪个都走它）
const mockProvider = vi.hoisted(() => ({
  chat: vi.fn(),
  chatStream: vi.fn(),
  generatePlan: vi.fn(),
}));
const mockBuildSystemPrompt = vi.hoisted(() => vi.fn());

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
vi.mock('src/modules/ai-coach/providers/glm.js', () => ({ glmProvider: mockProvider }));
vi.mock('src/modules/ai-coach/providers/stub.js', () => ({ stubProvider: mockProvider }));
vi.mock('src/modules/ai-coach/context-builder.js', () => ({
  buildSystemPrompt: mockBuildSystemPrompt,
}));
// V0.1.140 setPersona 用 Cache.delByPattern
vi.mock('src/infra/cache.js', () => ({
  Cache: {
    delByPattern: vi.fn().mockResolvedValue(0),
    // V0.1.141 loadHistory Cache.wrap：mock 调 loader（不真缓存，测试隔离）
    wrap: vi.fn(async (_k: string, _t: number, loader: () => Promise<unknown>) => loader()),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn().mockResolvedValue(undefined),
  },
}));

import { aiCoachService } from 'src/modules/ai-coach/ai-coach.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LLM_API_KEY = 'test.key'; // 走 glmProvider（已 mock）
  mockBuildSystemPrompt.mockResolvedValue('sys-prompt');
});

describe('aiCoachService.chat (V0.1.139 多轮记忆)', () => {
  it('loadHistory + provider.chat + saveTurns（user+assistant）', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { role: 'user', content: 'hi', createdAt: new Date('2026-07-13T10:00:00Z') },
      { role: 'assistant', content: '你好', createdAt: new Date('2026-07-13T10:00:01Z') },
    ] as never);
    mockProvider.chat.mockResolvedValue('建议你练间歇');
    mocks.prisma.conversationTurn.createMany.mockResolvedValue({ count: 2 } as never);

    const r = await aiCoachService.chat('u1', { message: '怎么训练' });

    expect(r.reply).toBe('建议你练间歇');
    expect(r.conversationId).toBeTruthy();
    // provider 收到 history + 新 user 消息
    expect(mockProvider.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hi' }),
        expect.objectContaining({ role: 'user', content: '怎么训练' }),
      ]),
      'sys-prompt',
    );
    // 落本轮 user + assistant
    expect(mocks.prisma.conversationTurn.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: '怎么训练' }),
          expect.objectContaining({ role: 'assistant', content: '建议你练间歇' }),
        ]),
      }),
    );
  });

  it('无 conversationId → 生成新 uuid', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([] as never);
    mockProvider.chat.mockResolvedValue('ok');
    mocks.prisma.conversationTurn.createMany.mockResolvedValue({ count: 2 } as never);
    const r = await aiCoachService.chat('u1', { message: 'hi' });
    expect(r.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('aiCoachService.chatStream (V0.1.139 流式 + asciiFrame)', () => {
  it('hijack + 逐 token write SSE + 流完落库', async () => {
    mockProvider.chatStream.mockImplementation(async function* () {
      yield '你';
      yield '好';
    });
    const writes: string[] = [];
    const mockReply = {
      hijack: vi.fn(),
      raw: {
        writeHead: vi.fn(),
        flushHeaders: vi.fn(),
        write: (s: string) => writes.push(s),
        end: vi.fn(),
      },
    };
    mocks.prisma.conversationTurn.createMany.mockResolvedValue({ count: 2 } as never);

    await aiCoachService.chatStream('u1', { message: 'hi' }, mockReply as never);

    expect(mockReply.hijack).toHaveBeenCalled();
    // asciiFrame：中文 \uXXXX 转义（纯 ASCII）
    expect(writes.some((w) => w.includes('"t":"\\u4f60"'))).toBe(true); // "你" → 你
    expect(writes.some((w) => w.includes('"done"'))).toBe(true);
    expect(mocks.prisma.conversationTurn.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ role: 'assistant', content: '你好' }),
        ]),
      }),
    );
  });

  it('provider 异常 → 写 error 帧 + 仍落 user 轮', async () => {
    mockProvider.chatStream.mockImplementation(async function* () {
      throw new Error('GLM down');
    });
    const writes: string[] = [];
    const mockReply = {
      hijack: vi.fn(),
      raw: { writeHead: vi.fn(), flushHeaders: vi.fn(), write: (s: string) => writes.push(s), end: vi.fn() },
    };
    mocks.prisma.conversationTurn.create.mockResolvedValue({ id: 't1' } as never);

    await aiCoachService.chatStream('u1', { message: 'hi' }, mockReply as never);

    expect(writes.some((w) => w.includes('"error"'))).toBe(true);
    expect(mocks.prisma.conversationTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'user', content: 'hi' }) }),
    );
  });
});

describe('aiCoachService.generatePlan (V0.1.139)', () => {
  it('调 provider.generatePlan 透传返 plan（不落库）', async () => {
    const plan = {
      title: '5K', level: 'beginner', weeks: 8, goal: '5K',
      weeklyMileage: '15', targetKm: 120, days: [{ day: '周一', type: 'easy', content: 'x' }],
    };
    mockProvider.generatePlan.mockResolvedValue(plan);
    const r = await aiCoachService.generatePlan('u1', { message: '生成计划' });
    expect(r.plan.title).toBe('5K');
    expect(mocks.prisma.trainingPlan.create).not.toHaveBeenCalled();
  });
});

describe('aiCoachService.adoptPlan (V0.1.139)', () => {
  it('create TrainingPlan archived + upsert Enrollment', async () => {
    mocks.prisma.trainingPlan.create.mockResolvedValue({ id: 'p1', name: '5K' } as never);
    mocks.prisma.userPlanEnrollment.upsert.mockResolvedValue({
      joinedAt: new Date('2026-07-13T10:00:00Z'),
    } as never);

    const plan = {
      title: '5K 入门', level: 'beginner', weeks: 8, goal: '5K',
      weeklyMileage: '15', targetKm: 120, days: [{ day: '周一', type: 'easy', content: 'x' }],
    };
    const r = await aiCoachService.adoptPlan('u1', plan);

    expect(r.planId).toBe('p1');
    expect(r.planName).toBe('5K');
    // archived 避免污染 myPlans active 模板
    expect(mocks.prisma.trainingPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'archived' }) }),
    );
    // key 唯一前缀
    expect(mocks.prisma.trainingPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: expect.stringMatching(/^ai:u1:\d+$/) }),
      }),
    );
    expect(mocks.prisma.userPlanEnrollment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });
});

describe('aiCoachService.history (V0.1.139 完善)', () => {
  it('传 conversationId → 返该会话消息（时间正序）', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '你好' },
    ] as never);
    const r = await aiCoachService.history('u1', { conversationId: 'c1' });
    expect(r.conversationId).toBe('c1');
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toEqual({ role: 'user', content: 'hi' });
  });

  it('不传 conversationId + 无历史 → 空', async () => {
    mocks.prisma.conversationTurn.findFirst.mockResolvedValue(null);
    const r = await aiCoachService.history('u1', {});
    expect(r.conversationId).toBe('');
    expect(r.messages).toEqual([]);
  });

  it('不传 conversationId + 有历史 → 自动取最近会话', async () => {
    mocks.prisma.conversationTurn.findFirst.mockResolvedValue({ conversationId: 'c-latest' } as never);
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { role: 'user', content: 'x' },
    ] as never);
    const r = await aiCoachService.history('u1', {});
    expect(r.conversationId).toBe('c-latest');
  });
});

describe('aiCoachService.regenerate (V0.1.139 完善)', () => {
  it('删最后 assistant + 用其前历史重新生成', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { id: 't1', role: 'user', content: '怎么训练' },
      { id: 't2', role: 'assistant', content: '旧回复' },
    ] as never);
    mocks.prisma.conversationTurn.delete.mockResolvedValue({ id: 't2' } as never);
    mockProvider.chat.mockResolvedValue('新回复');
    mocks.prisma.conversationTurn.create.mockResolvedValue({ id: 't3' } as never);

    const r = await aiCoachService.regenerate('u1', { conversationId: 'c1' });

    expect(r.reply).toBe('新回复');
    expect(mocks.prisma.conversationTurn.delete).toHaveBeenCalledWith({ where: { id: 't2' } });
    expect(mocks.prisma.conversationTurn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: '新回复' }) }),
    );
  });

  it('无 assistant → 返空 reply（不调 provider）', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { id: 't1', role: 'user', content: 'hi' },
    ] as never);
    const r = await aiCoachService.regenerate('u1', { conversationId: 'c1' });
    expect(r.reply).toBe('');
    expect(mockProvider.chat).not.toHaveBeenCalled();
  });
});

describe('aiCoachService.conversations (V0.1.139 完善 多会话)', () => {
  it('内存 groupBy → 每会话最近消息 + 计数（按时间 desc）', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([
      { conversationId: 'c2', content: '新会话最近消息', createdAt: new Date('2026-07-13T12:00:00Z') },
      { conversationId: 'c2', content: '新会话第二条', createdAt: new Date('2026-07-13T11:00:00Z') },
      { conversationId: 'c1', content: '旧会话最近消息', createdAt: new Date('2026-07-13T10:00:00Z') },
    ] as never);

    const r = await aiCoachService.conversations('u1');
    expect(r.conversations).toHaveLength(2);
    expect(r.conversations[0].conversationId).toBe('c2'); // 时间最新在前
    expect(r.conversations[0].lastMessage).toBe('新会话最近消息');
    expect(r.conversations[0].messageCount).toBe(2);
    expect(r.conversations[1].conversationId).toBe('c1');
    expect(r.conversations[1].messageCount).toBe(1);
  });

  it('无任何会话 → 空', async () => {
    mocks.prisma.conversationTurn.findMany.mockResolvedValue([] as never);
    const r = await aiCoachService.conversations('u1');
    expect(r.conversations).toEqual([]);
  });
});

describe('aiCoachService.deleteConversation (V0.1.139 完善)', () => {
  it('deleteMany 按 userId + conversationId', async () => {
    mocks.prisma.conversationTurn.deleteMany.mockResolvedValue({ count: 5 } as never);
    const r = await aiCoachService.deleteConversation('u1', { conversationId: 'c1' });
    expect(r.ok).toBe(true);
    expect(mocks.prisma.conversationTurn.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', conversationId: 'c1' } }),
    );
  });
});

describe('aiCoachService.setPersona (V0.1.140 A 人设切换)', () => {
  it('update User.aiCoachPersona + 失效 cache', async () => {
    mocks.prisma.user.update.mockResolvedValue({ id: 'u1' } as never);
    const r = await aiCoachService.setPersona('u1', { persona: 'strict' });
    expect(r.persona).toBe('strict');
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { aiCoachPersona: 'strict' } }),
    );
  });
});

describe('aiCoachService.warmup (V0.1.141 B 预热)', () => {
  it('调 buildSystemPrompt 预 Cache', async () => {
    mockBuildSystemPrompt.mockResolvedValue('sys-prompt');
    const r = await aiCoachService.warmup('u1');
    expect(r.ok).toBe(true);
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith('u1');
  });
});
