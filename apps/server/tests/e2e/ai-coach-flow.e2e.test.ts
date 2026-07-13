/**
 * ai-coach 全链路 e2e（in-process fastify + inject，Stub 模式）
 *
 * 覆盖：chat / generatePlan / adoptPlan / history / regenerate / conversations / deleteConversation + 安全（401）
 * Stub 模式：beforeAll 删 LLM_API_KEY → provider 走 Stub（规则话术 + 模板），不依赖真 GLM
 *
 * 数据隔离：prefix `e2e-ai-` + afterAll 强删 ConversationTurn/TrainingPlan/UserPlanEnrollment/User
 *
 * 跑法：RUN_E2E=1 pnpm test ai-coach-flow（需 PG + Redis）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';

const E2E_USER_CODE = 'e2e-ai-user-code';
const E2E_OPENID = `e2e-ai-${E2E_USER_CODE}`;

const VALID_PLAN = {
  title: 'e2e 5K 入门',
  level: 'beginner' as const,
  weeks: 8,
  goal: '完成首个 5K',
  weeklyMileage: '约 15km/周',
  targetKm: 120,
  days: [
    { day: '周一', type: 'easy', content: '轻松跑 3km', distanceKm: 3 },
    { day: '周二', type: 'rest', content: '休息' },
    { day: '周三', type: 'interval', content: '间歇 4×400m' },
    { day: '周四', type: 'easy', content: '轻松跑 3km' },
    { day: '周五', type: 'cross', content: '交叉训练' },
    { day: '周六', type: 'long', content: '长距离 5km' },
    { day: '周日', type: 'rest', content: '全休' },
  ],
};

// ===== mock 微信 code2Session =====
vi.mock('../../src/common/integrations/wx/code2session.js', () => ({
  code2Session: vi.fn(async (code: string) => ({ openid: `e2e-ai-${code}`, session_key: 'sk-ai' })),
}));

const { buildApp } = await import('../../src/app.js');

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

describe.skipIf(skip)('ai-coach 全链路 e2e（Stub 模式）', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token: string;
  let userId: string;
  let conversationId: string;

  beforeAll(async () => {
    delete process.env.LLM_API_KEY; // 强制走 Stub（不依赖真 GLM）
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    app = await buildApp();
    await app.ready();

    const login = await app.inject({
      method: 'POST',
      url: '/api/user',
      payload: { action: 'login', payload: { code: E2E_USER_CODE } },
    });
    expect(login.statusCode).toBe(200);
    const body = login.json();
    expect(body.code).toBe(0);
    token = body.data.accessToken;
    userId = body.data.user.id;
  });

  afterAll(async () => {
    await prisma.conversationTurn.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.userPlanEnrollment.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.trainingPlan.deleteMany({ where: { key: { startsWith: `ai:${userId}:` } } }).catch(() => undefined);
    await prisma.user.delete({ where: { openid: E2E_OPENID } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  itE2E('① chat → reply + 落 2 条 ConversationTurn（user+assistant）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'chat', payload: { message: '怎么训练' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe(0);
    expect(body.data.reply).toBeTruthy();
    conversationId = body.data.conversationId;
    expect(conversationId).toBeTruthy();

    const turns = await prisma.conversationTurn.findMany({
      where: { userId, conversationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(turns.length).toBe(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].content).toBe('怎么训练');
    expect(turns[1].role).toBe('assistant');
  });

  itE2E('② generatePlan → 结构化周计划（Stub 半马推断 challenge）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'generatePlan', payload: { message: '我要跑半马' } },
    });
    const plan = res.json().data.plan;
    expect(plan.level).toBe('challenge');
    expect(plan.days).toHaveLength(7);
    expect(plan.targetKm).toBeGreaterThan(0);
  });

  itE2E('③ adoptPlan → TrainingPlan archived + UserPlanEnrollment', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'adoptPlan', payload: { plan: VALID_PLAN } },
    });
    const data = res.json().data;
    expect(data.planId).toBeTruthy();

    const enr = await prisma.userPlanEnrollment.findUnique({ where: { userId } });
    expect(enr?.planId).toBe(data.planId);

    const plan = await prisma.trainingPlan.findUnique({ where: { id: data.planId } });
    expect(plan?.status).toBe('archived'); // AI 计划不污染 myPlans active
    expect(plan?.key).toMatch(/^ai:/);
  });

  itE2E('④ history → 返会话消息（正序）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'history', payload: { conversationId } },
    });
    const data = res.json().data;
    expect(data.conversationId).toBe(conversationId);
    expect(data.messages.length).toBeGreaterThanOrEqual(2);
  });

  itE2E('⑤ regenerate → 删旧 assistant + 新 reply', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'regenerate', payload: { conversationId } },
    });
    expect(res.json().data.reply).toBeTruthy();
    // regenerate 不增 conversationTurn 总数（删 1 旧 assistant + 加 1 新）
    const turns = await prisma.conversationTurn.findMany({ where: { userId, conversationId } });
    expect(turns.length).toBe(2);
  });

  itE2E('⑥ conversations → 会话列表含本次', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'conversations' },
    });
    const list = res.json().data.conversations as Array<{ conversationId: string }>;
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((c) => c.conversationId === conversationId)).toBe(true);
  });

  itE2E('⑦ deleteConversation → 清空该会话', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      headers: auth(),
      payload: { action: 'deleteConversation', payload: { conversationId } },
    });
    expect(res.json().data.ok).toBe(true);
    const turns = await prisma.conversationTurn.findMany({ where: { userId, conversationId } });
    expect(turns.length).toBe(0);
  });

  itE2E('⑧ 安全：未登录 chat → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai-coach',
      payload: { action: 'chat', payload: { message: 'x' } },
    });
    expect(res.statusCode).toBe(401);
  });
});
