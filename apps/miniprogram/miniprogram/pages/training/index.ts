// pages/training/index.ts — 锻炼/训练中心（参考图 2775）
import { api } from '../../services/api';

interface TrainingPlan {
  key: string;
  name: string;
  weeks: number;
  level: string; // 中文显示（入门/进阶/挑战/极限）
  levelKey?: string; // 英文 class key（wxss 中文 selector 易编译失败，V0.1.32 修）
  goal: string;
  desc: string;
  weeklyMileage: string;
}

/** level 中文 → 英文 class key 映射（wxss 不支持中文 selector，分离显示与样式） */
const LEVEL_KEY_MAP: Record<string, string> = {
  入门: 'beginner',
  进阶: 'intermediate',
  挑战: 'challenge',
  极限: 'extreme',
};

interface SportRecord {
  id: string;
  source: 'manual' | 'garmin';
  date: string;
  distanceKm: number;
  durationMin: number;
  pace: string | null;
}

interface MarathonContent {
  id: string;
  title: string;
  cover: string | null;
  date: string | null;
  location: string | null;
  summary: string | null;
}

Page({
  data: {
    plans: [] as TrainingPlan[],
    records: [] as SportRecord[],
    summary: { totalRuns: 0, totalDistanceKm: 0, avgDistanceKm: 0 },
    marathons: [] as MarathonContent[],
    loadingPlans: false,
    loadingRecords: false,
    loadingMarathons: false,
    // 目标设置（本地态，跳打卡页携带）
    targetDistance: 5,
  },

  onShow() {
    this.loadPlans();
    this.loadRecords();
    this.loadMarathons();
  },

  /** 训练计划模板（training.myPlans） */
  async loadPlans() {
    this.setData({ loadingPlans: true });
    try {
      const res = await api.call<{ plans: TrainingPlan[] }>('training', 'myPlans', {});
      // 注入 levelKey（英文 class，避免 wxss 中文 selector 编译错）
      this.setData({
        plans: res.plans.map((p) => ({ ...p, levelKey: LEVEL_KEY_MAP[p.level] || 'beginner' })),
        loadingPlans: false,
      });
    } catch {
      this.setData({ loadingPlans: false });
    }
  },

  /** 跑步记录（training.mySportRecords） */
  async loadRecords() {
    this.setData({ loadingRecords: true });
    try {
      const res = await api.call<{
        records: SportRecord[];
        summary: { totalRuns: number; totalDistanceKm: number; avgDistanceKm: number };
      }>('training', 'mySportRecords', { limit: 10 });
      this.setData({ records: res.records, summary: res.summary, loadingRecords: false });
    } catch {
      this.setData({ loadingRecords: false });
    }
  },

  /** 赛事助手（复用 content.list type=marathon，DRY） */
  async loadMarathons() {
    this.setData({ loadingMarathons: true });
    try {
      const res = await api.call<{ list: MarathonContent[] }>('content', 'list', {
        type: 'marathon',
        page: 1,
        pageSize: 5,
      });
      this.setData({ marathons: res.list ?? [], loadingMarathons: false });
    } catch {
      this.setData({ loadingMarathons: false });
    }
  },

  /** 选目标距离 */
  onPickTarget(e: WechatMiniprogram.TouchEvent) {
    const km = Number(e.currentTarget.dataset.km);
    this.setData({ targetDistance: km });
  },

  /** GO 立即跑步（切到运动 tab） */
  onGo() {
    wx.switchTab({ url: '/pages/sport/index' });
  },

  /** 点训练计划卡 */
  onTapPlan(e: WechatMiniprogram.TouchEvent) {
    const plan = this.data.plans.find((p) => p.key === e.currentTarget.dataset.key);
    if (!plan) return;
    wx.showModal({
      title: plan.name,
      content: `${plan.desc}\n周期 ${plan.weeks} 周 · ${plan.weeklyMileage}\n目标：${plan.goal}`,
      showCancel: false,
      confirmText: '了解',
    });
  },

  /** 点赛事卡 → 详情 */
  onTapMarathon(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },
});
