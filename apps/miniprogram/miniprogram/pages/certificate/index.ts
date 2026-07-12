// pages/certificate/index.ts — 我的证书（V0.1.28 跑者向 — 里程碑 + 赛事 + V0.1.135 多种证书）
import { api } from '../../services/api';

interface MilestoneCert {
  type: 'milestone';
  km: number;
  title: string;
  desc: string;
  currentKm: number;
}

interface MarathonCert {
  type: 'marathon';
  enrollmentId: string;
  contentId: string;
  title: string;
  date: string | null;
  location: string | null;
  cover: string | null;
  status: string;
}

interface CustomMilestone {
  km: number;
  title: string;
  icon?: string;
}

interface PaceProgressCert {
  type: 'pace_progress';
  title: string;
  desc: string;
  achieved: boolean;
  currentPace?: number;
  baselinePace?: number;
  improvementPct?: number;
  reason?: string;
}

interface ConsecutiveCert {
  type: 'consecutive_checkin';
  title: string;
  currentStreak: number;
  longestStreak: number;
  achieved: Array<{ days: number; title: string; desc: string }>;
}

interface GroupCert {
  type: 'group_contribution';
  title: string;
  desc: string;
  achieved: boolean;
  topRanks: Array<{ groupId: string; groupName: string; rank: number }>;
}

interface CertsRes {
  totalDistance: number;
  totalCheckins: number;
  milestones: MilestoneCert[];
  marathons: MarathonCert[];
  nextMilestone: { km: number; title: string; desc: string } | null;
  // V0.1.135
  paceProgressCert: PaceProgressCert;
  consecutiveCheckinCert: ConsecutiveCert;
  groupContributionCert: GroupCert;
}

Page({
  data: {
    certs: null as CertsRes | null,
    customMilestones: [] as CustomMilestone[],
    loading: false,
    nextPercent: 0,
    showCustomForm: false,
    customForm: { km: 0, title: '', icon: '' },
    submitting: false,
  },

  onShow() {
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [certsRes, milestonesRes] = await Promise.all([
        api.call<CertsRes>('stats', 'myCertificates', {}),
        api.call<{ milestones: CustomMilestone[] }>('goal', 'listCustomMilestones', {}),
      ]);
      this.setData({
        certs: certsRes,
        customMilestones: milestonesRes.milestones,
        nextPercent: certsRes.nextMilestone
          ? Math.min(100, Math.round((certsRes.totalDistance / certsRes.nextMilestone.km) * 100))
          : 100,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 打开自定义里程碑表单 */
  onAddCustom() {
    this.setData({
      showCustomForm: true,
      customForm: { km: 0, title: '', icon: '' },
    });
  },

  closeCustomForm() {
    this.setData({ showCustomForm: false });
  },

  onCustomKm(e: WechatMiniprogram.Input) {
    this.setData({ 'customForm.km': Number(e.detail.value) || 0 });
  },
  onCustomTitle(e: WechatMiniprogram.Input) {
    this.setData({ 'customForm.title': e.detail.value });
  },
  onCustomIcon(e: WechatMiniprogram.Input) {
    this.setData({ 'customForm.icon': e.detail.value });
  },

  async onSubmitCustom() {
    const { km, title, icon } = this.data.customForm;
    if (!km || km <= 0 || !title.trim()) {
      wx.showToast({ title: '请填 km 和标题', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('goal', 'addCustomMilestone', {
        km,
        title: title.trim(),
        icon: icon.trim() || undefined,
      });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ showCustomForm: false, submitting: false });
      await this.loadAll();
    } catch (err) {
      this.setData({ submitting: false });
      wx.showToast({ title: (err as Error).message ?? '添加失败', icon: 'none' });
    }
  },

  async onDeleteCustom(e: WechatMiniprogram.TouchEvent) {
    const km = e.currentTarget.dataset.km as number;
    await api.call('goal', 'removeCustomMilestone', { km });
    await this.loadAll();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  /** 证书分享海报 */
  onShareCert(e: WechatMiniprogram.TouchEvent) {
    const idx = e.currentTarget.dataset.idx as number;
    const certType = e.currentTarget.dataset.type as string;
    // 简化：暂 toast 提示
    wx.showToast({ title: `分享证书 #${idx} (${certType})`, icon: 'none' });
  },
});
