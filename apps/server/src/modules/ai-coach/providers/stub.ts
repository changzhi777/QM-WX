/**
 * StubProvider — 规则话术占位（V0.1.139 AI 私教）
 *
 * 启用条件：feature_flags.ai=off 或未配 LLM_API_KEY
 * 特性：
 * - chat：关键词匹配（训练/恢复/营养/伤病/跑鞋/配速）→ 规则话术池
 * - chatStream：逐字 async generator（每字 30ms，模拟打字机；保证前端代码与真模型 provider 不分叉）
 * - generatePlan：按 level 选 4 套固定模板（5K/10K/半马/全马）
 *
 * 演示模式话术明确告知用户"配置真实 AI 后体验更佳"，不伪装成真 AI
 */
import type { ChatMessage, LLMProvider } from './types.js';
import type { PlanStructure } from '../ai-coach.schema.js';

/** 关键词 → 回复池（覆盖跑者高频问题） */
const RULE_REPLIES: Array<{ keywords: string[]; replies: string[] }> = [
  {
    keywords: ['训练', '计划', '练什么', '怎么练'],
    replies: [
      '根据 80/20 法则，建议本周 3-4 次跑步：1 次长距离、1 次间歇、1-2 次轻松跑，中间穿插休息。80% 低强度 + 20% 高强度。',
      '一个好的训练周应包含：长距离（有氧基础）+ 间歇（速度）+ 轻松跑（恢复）+ 休息。循序渐进，每周加量不超过 10%。',
    ],
  },
  {
    keywords: ['恢复', '休息', '累', '疲劳', '酸痛'],
    replies: [
      '恢复和训练一样重要。睡眠 7-9 小时、跑后拉伸 10 分钟、高强度训练后安排轻松跑或全休。',
      '感觉疲劳时别硬撑。肌肉酸痛超过 48 小时或晨脉比平时高 5 次以上，建议休息一天。',
    ],
  },
  {
    keywords: ['营养', '吃什么', '饮食', '补充', '能量'],
    replies: [
      '跑者日常饮食建议碳水 50-60%、蛋白 15-20%、脂肪 20-30%。长距离前 2 小时补碳水，跑后 30 分钟内补碳水+蛋白。',
      '日常饮水量：体重(kg)×35ml。长距离训练中每 20 分钟补 150-200ml，超过 1 小时建议补电解质。',
    ],
  },
  {
    keywords: ['伤', '疼', '痛', '膝盖', '足底', '胫骨'],
    replies: [
      '跑步疼痛不要忽视。急性疼痛（0-10 分≥4）立即停跑冰敷 15 分钟；持续 3 天以上的疼痛建议就医。',
      '常见跑者伤：膝盖（跑者膝）、足底筋膜炎、胫骨疼。强化臀肌+小腿、循序渐进加量是预防关键。',
    ],
  },
  {
    keywords: ['跑鞋', '鞋', '换鞋'],
    replies: [
      '跑鞋寿命一般 600-800km。当鞋底磨损明显、中底失去弹性或健康度≥70% 时该换新鞋了。',
      '选跑鞋看脚型：正常足选稳定型、扁平足选支撑型、高足弓选缓震型。建议到专业跑店做步态分析。',
    ],
  },
  {
    keywords: ['配速', '快', '慢', '提速', '速度'],
    replies: [
      '配速提升靠积累有氧基础。先保证 80% 跑量在轻松区间（能开口说话的心率），再用间歇/节奏跑练速度。',
      '轻松跑配速应比比赛配速慢 60-90 秒/公里。太快练轻松跑是新手最常犯的错。',
    ],
  },
];

const DEFAULT_REPLY =
  '我是青沐 AI 私教（演示模式）。可以问我训练计划、恢复、营养、伤病、跑鞋或配速相关的问题。配置真实 AI 模型后，我会结合你的跑量、目标和跑鞋状态给出更个性化的建议。';

function matchReply(message: string): string {
  const msg = message.toLowerCase();
  for (const rule of RULE_REPLIES) {
    if (rule.keywords.some((k) => msg.includes(k))) {
      return rule.replies[Math.floor(Math.random() * rule.replies.length)];
    }
  }
  return DEFAULT_REPLY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 逐字流式（async generator，每字延迟模拟打字机） */
async function* streamText(text: string, delayMs = 30): AsyncIterable<string> {
  for (const ch of text) {
    yield ch;
    await sleep(delayMs);
  }
}

/** 4 套训练计划模板（按 level 选，复用 V0.1.25 training 硬编码结构思路） */
const PLAN_TEMPLATES: Record<string, PlanStructure> = {
  beginner: {
    title: '5K 入门周计划',
    level: 'beginner',
    weeks: 8,
    goal: '完成首个 5 公里',
    weeklyMileage: '约 15 km/周',
    targetKm: 120,
    days: [
      { day: '周一', type: 'easy', content: '轻松跑 3km（能开口说话的配速）', distanceKm: 3 },
      { day: '周二', type: 'rest', content: '休息或散步 30 分钟' },
      { day: '周三', type: 'interval', content: '间歇跑 4×400m（中间走 200m 恢复）', distanceKm: 2 },
      { day: '周四', type: 'easy', content: '轻松跑 3km', distanceKm: 3 },
      { day: '周五', type: 'cross', content: '交叉训练（骑行/游泳 30 分钟）' },
      { day: '周六', type: 'long', content: '长距离 5km（放慢配速）', distanceKm: 5 },
      { day: '周日', type: 'rest', content: '全休 + 拉伸 15 分钟' },
    ],
  },
  intermediate: {
    title: '10K 进阶周计划',
    level: 'intermediate',
    weeks: 10,
    goal: '10K 跑进 60 分钟',
    weeklyMileage: '约 28 km/周',
    targetKm: 280,
    days: [
      { day: '周一', type: 'easy', content: '轻松跑 5km', distanceKm: 5 },
      { day: '周二', type: 'tempo', content: '节奏跑 4km（比比赛配速慢 15 秒）', distanceKm: 4 },
      { day: '周三', type: 'rest', content: '休息或瑜伽' },
      { day: '周四', type: 'interval', content: '间歇 6×400m（配速比 5K 快）', distanceKm: 4 },
      { day: '周五', type: 'easy', content: '轻松跑 5km', distanceKm: 5 },
      { day: '周六', type: 'long', content: '长距离 8km', distanceKm: 8 },
      { day: '周日', type: 'cross', content: '交叉训练 40 分钟' },
    ],
  },
  challenge: {
    title: '半马挑战周计划',
    level: 'challenge',
    weeks: 12,
    goal: '完成半程马拉松（21.1km）',
    weeklyMileage: '约 40 km/周',
    targetKm: 480,
    days: [
      { day: '周一', type: 'easy', content: '轻松跑 6km', distanceKm: 6 },
      { day: '周二', type: 'interval', content: '间歇 8×400m', distanceKm: 5 },
      { day: '周三', type: 'easy', content: '轻松跑 5km', distanceKm: 5 },
      { day: '周四', type: 'tempo', content: '节奏跑 6km', distanceKm: 6 },
      { day: '周五', type: 'rest', content: '休息' },
      { day: '周六', type: 'long', content: '长距离慢跑 12km', distanceKm: 12 },
      { day: '周日', type: 'cross', content: '交叉训练或拉伸' },
    ],
  },
  extreme: {
    title: '全马极限周计划',
    level: 'extreme',
    weeks: 16,
    goal: '完成全程马拉松（42.2km）',
    weeklyMileage: '约 55 km/周',
    targetKm: 880,
    days: [
      { day: '周一', type: 'easy', content: '轻松跑 8km', distanceKm: 8 },
      { day: '周二', type: 'interval', content: '间歇 10×400m', distanceKm: 6 },
      { day: '周三', type: 'easy', content: '轻松跑 6km', distanceKm: 6 },
      { day: '周四', type: 'tempo', content: '节奏跑 8km', distanceKm: 8 },
      { day: '周五', type: 'rest', content: '全休' },
      { day: '周六', type: 'long', content: '长距离 20km（LSD）', distanceKm: 20 },
      { day: '周日', type: 'easy', content: '恢复跑 5km', distanceKm: 5 },
    ],
  },
};

/** 从用户消息推断 level */
function inferLevel(message: string): string {
  if (/半马|21|half/i.test(message)) return 'challenge';
  if (/全马|42|full|marathon/i.test(message)) return 'extreme';
  if (/10\s*k|10\s*公里/i.test(message)) return 'intermediate';
  return 'beginner';
}

export const stubProvider: LLMProvider = {
  async chat(messages: ChatMessage[], _systemPrompt: string): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return matchReply(lastUser?.content ?? '');
  },

  async *chatStream(messages: ChatMessage[], _systemPrompt: string): AsyncIterable<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const reply = matchReply(lastUser?.content ?? '');
    yield* streamText(reply);
  },

  async generatePlan(messages: ChatMessage[], _systemPrompt: string): Promise<PlanStructure> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUser?.content ?? '';
    return PLAN_TEMPLATES[inferLevel(content)];
  },
};
