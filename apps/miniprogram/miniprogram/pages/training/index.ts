// pages/training/index.ts — 锻炼/训练中心（参考图 2775）
// V0.1.41：训练计划配置化（admin CRUD + 用户加入 + 进度跟踪）
import { api } from '../../services/api';

interface TrainingPlan {
  id?: string;
  key: string;
  name: string;
  weeks: number;
  level: string; // 英文 key（beginner/intermediate/challenge/extreme，DB 存英文，作 wxss class）
  levelLabel?: string; // 中文显示（LEVEL_LABEL_MAP 映射，入门/进阶/挑战/极限）
  goal: string;
  desc: string;
  weeklyMileage: string;
  targetKm?: number;
}

/** level 英文 key → 中文显示（V0.1.41：DB level 存英文，class 直接用 level，显示映射中文） */
const LEVEL_LABEL_MAP: Record<string, string> = {
  beginner: '入门',
  intermediate: '进阶',
  challenge: '挑战',
  extreme: '极限',
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

interface ActivePlan {
  plan: TrainingPlan;
  joinedAt: string;
  daysJoined: number;
  currentDistance: number;
  targetKm: number;
  percent: number;
  completed: boolean;
}

Page({
  data: {
    plans: [] as TrainingPlan[],
    records: [] as SportRecord[],
    summary: { totalRuns: 0, totalDistanceKm: 0, avgDistanceKm: 0 },
    marathons: [] as MarathonContent[],
    activePlan: null as ActivePlan | null, // V0.1.41 当前加入的计划 + 进度
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
    this.loadMyActivePlan(); // V0.1.41
  },

  /** 训练计划模板（training.myPlans，V0.1.41 改读 DB active 计划） */
  async loadPlans() {
    this.setData({ loadingPlans: true });
    try {
      const res = await api.call<{ plans: TrainingPlan[] }>('training', 'myPlans', {});
      this.setData({
        plans: res.plans.map((p) => ({ ...p, levelLabel: LEVEL_LABEL_MAP[p.level] || p.level })),
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

  /** V0.1.41 我的当前计划 + 进度（无加入返 plan:null，UI 隐藏进度卡） */
  async loadMyActivePlan() {
    try {
      const res = await api.call<ActivePlan | { plan: null }>('training', 'myActivePlan', {});
      this.setData({ activePlan: res.plan ? (res as ActivePlan) : null });
    } catch {
      // 静默
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

  /** V0.1.41 点训练计划卡 — showModal 详情 + 加入/切换/离开 */
  onTapPlan(e: WechatMiniprogram.TouchEvent) {
    const plan = this.data.plans.find((p) => p.key === e.currentTarget.dataset.key);
    if (!plan) return;

    const activePlanId = this.data.activePlan?.plan?.id;
    const isActive = activePlanId != null && activePlanId === plan.id;
    const hasOther = this.data.activePlan != null && !isActive;

    const confirmText = isActive ? '离开计划' : hasOther ? '切换到此' : '加入计划';

    wx.showModal({
      title: plan.name,
      content: `${plan.desc}\n周期 ${plan.weeks} 周 · ${plan.weeklyMileage}\n目标：${plan.goal}`,
      confirmText,
      cancelText: '关闭',
      success: async (res) => {
        if (!res.confirm) return;
        if (isActive) {
          await this.leavePlan();
        } else {
          await this.joinPlan(plan.id!, plan.name);
        }
      },
    });
  },

  /** V0.1.41 加入/切换计划 */
  async joinPlan(planId: string, planName: string) {
    wx.showLoading({ title: '加入中...' });
    try {
      await api.call('training', 'joinPlan', { planId });
      wx.hideLoading();
      wx.showToast({ title: `已加入「${planName}」`, icon: 'success' });
      this.loadMyActivePlan();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err as Error).message ?? '加入失败', icon: 'none' });
    }
  },

  /** V0.1.41 离开计划 */
  async leavePlan() {
    wx.showLoading({ title: '处理中...' });
    try {
      await api.call('training', 'leavePlan', {});
      wx.hideLoading();
      wx.showToast({ title: '已离开计划', icon: 'success' });
      this.setData({ activePlan: null });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: (err as Error).message ?? '操作失败', icon: 'none' });
    }
  },

  /** 进度卡"离开"按钮（直接离开，不弹计划卡） */
  async onLeavePlan() {
    const ok = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '离开计划',
        content: '确定离开当前训练计划？进度将清零。',
        confirmText: '离开',
        cancelText: '取消',
        success: (r) => resolve(r.confirm),
      });
    });
    if (!ok) return;
    await this.leavePlan();
  },

  /** 点赛事卡 → 详情 */
  onTapMarathon(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/content-detail/index?id=${id}` });
  },

  /** V0.2.120 力量训练入口（跳到 strength 主页） */
  onGoStrength() {
    wx.navigateTo({ url: '/pages/strength/index' });
  },
});
