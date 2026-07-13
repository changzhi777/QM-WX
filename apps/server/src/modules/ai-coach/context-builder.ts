/**
 * ContextBuilder — 聚合全量跑者数据 + 人设 → system prompt（V0.1.140 完善）
 *
 * 4 人设（A）：共享 SYSTEM_BASE（职责+规则）+ PERSONA_PROMPTS（人设段），DRY
 * 计划追踪（C）：加当前计划进度（Checkin aggregate vs plan.targetKm）+ 最近 7 天打卡摘要
 * 建议标记（B）：SYSTEM_BASE 第 6 条约定 reply 末尾 `📋建议：` 标记，前端正则提取
 *
 * 全部走 prisma 直接查（不调其他 module service，避免循环依赖）
 * Cache 60s，key 含 persona（setPersona 改 DB → 下次新 persona 新 key，无需手动失效）
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';

const SYSTEM_PROMPT_CACHE_TTL = 60;

export type AiCoachPersona = 'scientist' | 'coach' | 'buddy' | 'strict';

/** 人设校验（DB 值可能 null/非法 → 默认 buddy）*/
export function validatePersona(p?: string | null): AiCoachPersona {
  return p === 'scientist' || p === 'coach' || p === 'buddy' || p === 'strict' ? p : 'buddy';
}

/** 共享 base（职责 + 规则，所有人设适用）*/
const SYSTEM_BASE = `你是青沐 AI 私教。根据用户画像给出个性化的训练 / 恢复 / 营养 / 伤病预防 / 跑鞋 / 配速建议。
规则：
1. 回答简洁实用（每次 200 字内），给可执行的具体动作，避免空泛套话
2. 涉及伤病谨慎，建议就医而非诊断
3. 鼓励循序渐进（每周加量 ≤ 10%），反对急功近利
4. 中文回复
5. 结合用户当前跑量、目标、跑鞋状态、训练计划进度个性化
6. 若有可执行建议（如加目标 / 调计划 / 换跑鞋），在回复末尾用「📋建议：动作描述」格式列 1-2 条（每条一行），前端会提取为卡片按钮；无可执行建议则不加`;

/** 4 人设段（A：只调语气 + 专业方向，拼到 SYSTEM_BASE 后）*/
const PERSONA_PROMPTS: Record<AiCoachPersona, string> = {
  scientist: `## 人设：运动科学家
你以运动科学家的人设回答：数据驱动，量化分析（心率区间 / 配速 / 训练负荷 / RPE），引用运动科学原理（如有氧基础、乳酸阈值、超量恢复），理性客观，用数据支撑每条建议。适合追求数据、计划性强的进阶跑者。`,
  coach: `## 人设：前职业教练
你以前职业教练的人设回答：经验丰富，讲故事举例（曾指导的跑者案例），激励用户，有温度，像老教练谈心。既专业又亲切，适合需要鼓励和指导的跑者。`,
  buddy: `## 人设：温暖陪跑伙伴
你以温暖陪跑伙伴的人设回答：鼓励为主，新手友好，语气亲切像朋友，庆祝每一次小进步，不施压。适合新手和需要陪伴感的跑者。`,
  strict: `## 人设：铁血教练
你以铁血教练的人设回答：严格纪律，目标导向，不妥协，指出问题直接了当，强调执行力和自律。适合有明确目标、需要被推着前进的跑者。`,
};

/** 构造 system prompt（含人设 + 画像，Cache 60s，key 含 persona）*/
export async function buildSystemPrompt(userId: string): Promise<string> {
  // 先查 persona 决定 cache key（轻量 select）
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { aiCoachPersona: true },
  });
  const persona = validatePersona(u?.aiCoachPersona);

  return Cache.wrap(`ai-coach:ctx:${userId}:${persona}`, SYSTEM_PROMPT_CACHE_TTL, async () => {
    const profile = await buildUserContext(userId);
    return `${SYSTEM_BASE}\n\n${PERSONA_PROMPTS[persona]}\n\n## 用户画像\n${profile}`;
  });
}

/** 聚合全量数据 → 画像文本（含 C：计划进度 + 最近 7 天打卡）*/
async function buildUserContext(userId: string): Promise<string> {
  const [user, yearStats, monthStats, activeGoals, shoes, enrollment, recentHr, recentSleep, recentSteps, latestBodyComp, recentRuns] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      aggregateRange(userId, yearStart(), new Date()),
      aggregateRange(userId, monthStart(), new Date()),
      prisma.goal.findMany({ where: { userId, status: 'active' }, take: 3, orderBy: { createdAt: 'desc' } }),
      prisma.shoe.findMany({ where: { userId, status: 'active' } }),
      prisma.userPlanEnrollment.findUnique({ where: { userId }, include: { plan: true } }),
      prisma.heartRateRecord.findFirst({ where: { userId }, orderBy: { timestamp: 'desc' } }),
      prisma.sleepRecord.findFirst({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.weRunRecord.findMany({
        where: { userId, date: { gte: daysAgo(7) } },
        orderBy: { date: 'desc' },
        take: 7,
      }),
      prisma.bodyCompositionRecord.findFirst({ where: { userId }, orderBy: { timestamp: 'desc' } }),
      // C：最近 7 天跑步（计划执行追踪）
      prisma.checkin.findMany({
        where: { userId, sportType: 'run', createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  const lines: string[] = [];

  if (user) {
    const age = user.birthday ? calcAge(user.birthday) : null;
    const parts = [user.gender ?? '未知性别'];
    if (age) parts.push(`${age} 岁`);
    if (user.height) parts.push(`${user.height}cm`);
    if (user.weight) parts.push(`${user.weight}kg`);
    if (user.region) parts.push(user.region);
    lines.push(`- 基本信息：${parts.join('，')}`);
  }

  lines.push(`- 本年跑量：${round2(yearStats.distance)}km / ${yearStats.count} 次；本月跑量：${round2(monthStats.distance)}km / ${monthStats.count} 次`);

  if (activeGoals.length) {
    const goalDesc = activeGoals
      .map((g) => `${g.title || g.type} ${g.targetDistance}km（${fmtDate(g.periodStart)}~${fmtDate(g.periodEnd)}）`)
      .join('；');
    lines.push(`- 当前目标：${goalDesc}`);
  }

  if (shoes.length) {
    const shoeDesc = shoes
      .map((s) => {
        const ratio = s.thresholdKm > 0 ? Math.round((s.currentKm / s.thresholdKm) * 100) : 0;
        return `${s.brand} ${s.model}${s.nickname ? `(${s.nickname})` : ''} ${s.currentKm}/${s.thresholdKm}km(${ratio}%)`;
      })
      .join('；');
    lines.push(`- 跑鞋：${shoeDesc}`);
  }

  // C：当前训练计划 + 进度（Checkin run aggregate vs plan.targetKm，复用 calcPlanProgress 逻辑）
  if (enrollment?.plan) {
    const progressAgg = await prisma.checkin.aggregate({
      where: { userId, sportType: 'run', createdAt: { gte: enrollment.joinedAt } },
      _sum: { distance: true },
    });
    const currentKm = round2(progressAgg._sum.distance ?? 0);
    const targetKm = enrollment.plan.targetKm;
    const pct = targetKm > 0 ? Math.min(100, Math.round((currentKm / targetKm) * 100)) : 0;
    lines.push(`- 训练计划：${enrollment.plan.name}（${enrollment.plan.weeks}周，目标 ${enrollment.plan.goal}）进度 ${currentKm}/${targetKm}km（${pct}%）`);
  }

  // C：最近 7 天跑步明细（执行追踪）
  if (recentRuns.length) {
    const runDesc = recentRuns.map((r) => `${r.date} ${round2(r.distance)}km`).join('，');
    lines.push(`- 最近 ${recentRuns.length} 次跑步：${runDesc}`);
  }

  if (recentHr) lines.push(`- 最近心率：${recentHr.value} bpm（${fmtDateTime(recentHr.timestamp)}）`);
  if (recentSleep?.score) {
    const dur = recentSleep.durationSeconds ? `，时长 ${Math.round(recentSleep.durationSeconds / 3600)}h` : '';
    lines.push(`- 最近睡眠评分：${recentSleep.score}${dur}`);
  }
  if (recentSteps.length) {
    const avg = Math.round(recentSteps.reduce((s, r) => s + r.step, 0) / recentSteps.length);
    lines.push(`- 近 ${recentSteps.length} 天日均步数：${avg}`);
  }
  if (latestBodyComp) {
    const bc: string[] = [];
    if (latestBodyComp.weight) bc.push(`体重 ${latestBodyComp.weight}kg`);
    if (latestBodyComp.bodyFat) bc.push(`体脂率 ${latestBodyComp.bodyFat}%`);
    if (latestBodyComp.bmi) bc.push(`BMI ${latestBodyComp.bmi}`);
    if (bc.length) lines.push(`- 最新体成分：${bc.join('，')}`);
  }

  return lines.join('\n');
}

// ===== helpers =====

async function aggregateRange(userId: string, start: Date, end: Date) {
  const a = await prisma.checkin.aggregate({
    where: { userId, createdAt: { gte: start, lt: end } },
    _sum: { distance: true },
    _count: true,
  });
  return { distance: a._sum.distance ?? 0, count: a._count };
}

function yearStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1);
}

function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function calcAge(birthday: string): number {
  const b = new Date(birthday);
  return Math.floor((Date.now() - b.getTime()) / (365.25 * 86_400_000));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
