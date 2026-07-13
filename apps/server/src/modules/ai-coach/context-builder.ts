/**
 * ContextBuilder — 聚合全量跑者数据 → system prompt（V0.1.139 AI 私教）
 *
 * 数据源（全量档）：user profile / Checkin 跑量(年+月) / Goal(active) / Shoe(健康度) /
 *                   UserPlanEnrollment(当前计划) / 心率/睡眠(最近) / 微信运动(近7天) / 体成分(最新)
 *
 * 全部走 prisma 直接查（不调其他 module service，避免循环依赖 + 减少调用栈）
 * Promise.all 并行查询（10 个查询并发，~1 轮 RTT）
 *
 * 画像段 Cache.wrap 60s（对话高频时省 10 个查询；跑量/目标/跑鞋变化不快）
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';

const SYSTEM_PROMPT_CACHE_TTL = 60;

const SYSTEM_PROMPT_BASE = `你是青沐 AI 私教，一位专业、温暖、务实的跑步教练。
职责：
1. 根据用户画像给出个性化的训练 / 恢复 / 营养 / 伤病预防 / 跑鞋 / 配速建议
2. 回答简洁实用（每次 200 字内），避免空泛套话；给可执行的具体动作
3. 涉及伤病谨慎，建议就医而非诊断
4. 鼓励循序渐进（每周加量≤10%），反对急功近利
5. 中文回复，语气亲切，术语需解释`;

/** 构造 system prompt（含用户画像，Cache 60s） */
export async function buildSystemPrompt(userId: string): Promise<string> {
  return Cache.wrap(`ai-coach:ctx:${userId}`, SYSTEM_PROMPT_CACHE_TTL, async () => {
    const profile = await buildUserContext(userId);
    return `${SYSTEM_PROMPT_BASE}\n\n## 用户画像\n${profile}`;
  });
}

/** 聚合全量数据 → 画像文本（10 个并行查询） */
async function buildUserContext(userId: string): Promise<string> {
  const [user, yearStats, monthStats, activeGoals, shoes, enrollment, recentHr, recentSleep, recentSteps, latestBodyComp] =
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

  if (enrollment?.plan) {
    lines.push(`- 当前训练计划：${enrollment.plan.name}（${enrollment.plan.weeks}周，目标 ${enrollment.plan.goal}）`);
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
