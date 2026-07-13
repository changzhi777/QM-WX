/**
 * StubProvider 单测（V0.1.139 AI 私教）
 *
 * 覆盖：chat 关键词匹配 / chatStream 逐字 yield / generatePlan level 推断 + 4 套模板
 * 纯函数测试，不依赖 prisma
 */
import { describe, it, expect } from 'vitest';
import { stubProvider } from 'src/modules/ai-coach/providers/stub.js';

describe('stubProvider.chat (V0.1.139)', () => {
  it('训练关键词 → 训练话术', async () => {
    const r = await stubProvider.chat([{ role: 'user', content: '我该怎么训练' }], 'sys');
    expect(r).toMatch(/训练|80\/20|长距离|间歇/);
  });

  it('恢复关键词 → 恢复话术', async () => {
    const r = await stubProvider.chat([{ role: 'user', content: '跑完很累怎么恢复' }], 'sys');
    expect(r).toMatch(/恢复|睡眠|拉伸|疲劳|休息|酸痛/);
  });

  it('未匹配 → DEFAULT_REPLY（演示模式提示）', async () => {
    const r = await stubProvider.chat([{ role: 'user', content: '今天天气不错' }], 'sys');
    expect(r).toContain('演示模式');
  });
});

describe('stubProvider.chatStream (V0.1.139 逐字流式)', () => {
  it('逐 token yield（打字机，token 数 > 1）', async () => {
    const tokens: string[] = [];
    for await (const t of stubProvider.chatStream([{ role: 'user', content: '怎么恢复' }], 'sys')) {
      tokens.push(t);
    }
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join('')).toMatch(/恢复|睡眠|拉伸|疲劳|休息|酸痛/);
  });
});

describe('stubProvider.generatePlan (V0.1.139 level 推断)', () => {
  it('半马 → challenge 模板', async () => {
    const plan = await stubProvider.generatePlan([{ role: 'user', content: '我要跑半马' }], 'sys');
    expect(plan.level).toBe('challenge');
    expect(plan.days).toHaveLength(7);
    expect(plan.targetKm).toBeGreaterThan(0);
  });

  it('全马 → extreme 模板', async () => {
    const plan = await stubProvider.generatePlan([{ role: 'user', content: '准备全马 42km' }], 'sys');
    expect(plan.level).toBe('extreme');
  });

  it('10K → intermediate', async () => {
    const plan = await stubProvider.generatePlan([{ role: 'user', content: '练 10k' }], 'sys');
    expect(plan.level).toBe('intermediate');
  });

  it('默认/新手 → beginner', async () => {
    const plan = await stubProvider.generatePlan([{ role: 'user', content: '刚开始跑步' }], 'sys');
    expect(plan.level).toBe('beginner');
  });
});
