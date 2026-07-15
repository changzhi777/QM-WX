// pages/runner/index.ts — 跑者数据中心（V0.1.143 合并 goal + certificate + annual-report + weekly-report）
// 4 tab：目标 / 证书 / 年报 / 周报（懒加载，切 tab 才请求）
import { api } from '../../services/api';
import type { WeeklyReport } from '@qm-wx/shared';

// === 目标 tab ===
interface Goal {
  id: string;
  type: string;
  typeLabel: string;
  title: string | null;
  targetDistance: number;
  currentDistance: number;
  percent: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  completed: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  monthly: '月度目标',
  yearly: '年度目标',
  custom: '自定义',
};

// === 证书 tab ===
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCert = any;

interface CertsRes {
  totalDistance: number;
  totalCheckins: number;
  milestones: MilestoneCert[];
  marathons: MarathonCert[];
  nextMilestone: { km: number; title: string; desc: string } | null;
  paceProgressCert: AnyCert;
  consecutiveCheckinCert: AnyCert;
  groupContributionCert: AnyCert;
  // V0.1.137 鞋成就
  shoesMilestonesCert: AnyCert;
  shoeDaysMilestonesCert: AnyCert;
  shoeCheckinMilestonesCert: AnyCert;
}

// === 年报 tab ===
interface MonthlyItem {
  month: number;
  distance: number;
  count: number;
}

interface AnnualReport {
  year: number;
  yearDistance: number;
  yearCheckins: number;
  yearDurationSec: number;
  avgPace: string | null;
  monthly: MonthlyItem[];
  longestRun: { distance: number; date: string } | null;
  activeDays: number;
}

// === 周报 tab ===
const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 1200;

type RunnerTab = 'goal' | 'certificate' | 'annual' | 'weekly';

Page({
  data: {
    tab: 'goal' as RunnerTab,
    // 目标
    goals: [] as Goal[],
    goalLoading: false,
    goalFormVisible: false,
    goalForm: { type: 'monthly', targetDistance: 50, title: '' },
    goalSubmitting: false,
    // 证书
    certs: null as CertsRes | null,
    customMilestones: [] as CustomMilestone[],
    certLoading: false,
    nextPercent: 0,
    showCustomForm: false,
    customForm: { km: 0, title: '', icon: '' },
    customSubmitting: false,
    // 年报
    report: null as AnnualReport | null,
    year: new Date().getFullYear(),
    annualLoading: false,
    maxMonthly: 1,
    durationHour: 0,
    // 周报
    reports: [] as WeeklyReport[],
    current: null as WeeklyReport | null,
    weeklyLoading: false,
    canvasReady: false,
  },

  onShow() {
    this.loadByTab(this.data.tab);
  },

  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = (e.currentTarget.dataset.tab as RunnerTab) || 'goal';
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.loadByTab(tab);
  },

  loadByTab(tab: RunnerTab) {
    if (tab === 'goal') this.loadGoals();
    else if (tab === 'certificate') this.loadCerts();
    else if (tab === 'annual') this.loadReport();
    else if (tab === 'weekly') this.loadWeekly();
  },

  // ===== 目标 tab =====
  async loadGoals() {
    this.setData({ goalLoading: true });
    try {
      const res = await api.call<{ goals: Omit<Goal, 'typeLabel'>[] }>('goal', 'list', {});
      this.setData({
        goals: res.goals.map((g) => ({ ...g, typeLabel: TYPE_LABEL[g.type] || g.type })),
        goalLoading: false,
      });
    } catch {
      this.setData({ goalLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onAddGoal() {
    this.setData({ goalFormVisible: true, goalForm: { type: 'monthly', targetDistance: 50, title: '' } });
  },

  onSelectType(e: WechatMiniprogram.TouchEvent) {
    const type = (e.currentTarget.dataset.type as string) || 'monthly';
    const defaultTarget = type === 'yearly' ? 600 : 50;
    this.setData({ goalForm: { ...this.data.goalForm, type, targetDistance: defaultTarget } });
  },

  onInputTarget(e: WechatMiniprogram.CustomEvent) {
    this.setData({ goalForm: { ...this.data.goalForm, targetDistance: Number(e.detail.value) || 50 } });
  },

  onInputTitle(e: WechatMiniprogram.CustomEvent) {
    this.setData({ goalForm: { ...this.data.goalForm, title: e.detail.value } });
  },

  async onSubmitGoal() {
    const { type, targetDistance, title } = this.data.goalForm;
    if (targetDistance < 1) {
      wx.showToast({ title: '目标至少 1 km', icon: 'none' });
      return;
    }
    this.setData({ goalSubmitting: true });
    try {
      await api.call('goal', 'add', { type, targetDistance, title: title.trim() || undefined });
      this.setData({ goalSubmitting: false, goalFormVisible: false });
      wx.showToast({ title: '已创建', icon: 'success' });
      this.loadGoals();
    } catch {
      this.setData({ goalSubmitting: false });
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  closeGoalForm() {
    this.setData({ goalFormVisible: false });
  },

  onRemoveGoal(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '删除目标',
      content: '确定删除这个目标吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('goal', 'remove', { id });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadGoals();
        } catch {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  // ===== 证书 tab =====
  async loadCerts() {
    this.setData({ certLoading: true });
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
        certLoading: false,
      });
    } catch {
      this.setData({ certLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onAddCustom() {
    this.setData({ showCustomForm: true, customForm: { km: 0, title: '', icon: '' } });
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
    this.setData({ customSubmitting: true });
    try {
      await api.call('goal', 'addCustomMilestone', { km, title: title.trim(), icon: icon.trim() || undefined });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ showCustomForm: false, customSubmitting: false });
      await this.loadCerts();
    } catch (err) {
      this.setData({ customSubmitting: false });
      wx.showToast({ title: (err as Error).message ?? '添加失败', icon: 'none' });
    }
  },

  async onDeleteCustom(e: WechatMiniprogram.TouchEvent) {
    const km = e.currentTarget.dataset.km as number;
    try {
      await api.call('goal', 'removeCustomMilestone', { km });
      await this.loadCerts();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // ===== 年报 tab =====
  async loadReport() {
    this.setData({ annualLoading: true });
    try {
      const res = await api.call<AnnualReport>('stats', 'myAnnualReport', { year: this.data.year });
      this.setData({
        report: res,
        maxMonthly: Math.max(...res.monthly.map((m) => m.distance), 1),
        durationHour: Math.round((res.yearDurationSec / 3600) * 10) / 10,
        annualLoading: false,
      });
    } catch {
      this.setData({ annualLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  prevYear() {
    this.setData({ year: this.data.year - 1 });
    this.loadReport();
  },

  nextYear() {
    this.setData({ year: this.data.year + 1 });
    this.loadReport();
  },

  onShareAppMessage() {
    const code = (getApp().globalData as { inviteCode?: string }).inviteCode;
    const suffix = code ? `?inviterCode=${code}` : '';
    const onSuccess = () => {
      api.call('points', 'awardShare').catch(() => {});
    };
    if (this.data.tab === 'annual' && this.data.report) {
      const r = this.data.report;
      return {
        title: `我 ${r.year} 年跑了 ${r.yearDistance} km，打卡 ${r.yearCheckins} 次！`,
        path: '/pages/runner/index' + suffix,
        success: onSuccess,
      };
    }
    return {
      title: '青沐跑者数据中心 🏃',
      path: '/pages/runner/index' + suffix,
      success: onSuccess,
    };
  },

  // ===== 周报 tab =====
  async loadWeekly() {
    this.setData({ weeklyLoading: true });
    try {
      const { reports } = await api.call<{ reports: WeeklyReport[] }>('weeklyReport', 'currentWeek');
      this.setData({ reports, weeklyLoading: false });
    } catch {
      this.setData({ weeklyLoading: false });
    }
  },

  async onSelectReport(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    const report = this.data.reports.find((r) => r.groupId === id);
    if (!report) return;
    this.setData({ current: report, canvasReady: false });
    setTimeout(() => this.setData({ canvasReady: true }, () => this.drawPoster(report)), 100);
  },

  onClosePoster() {
    this.setData({ current: null, canvasReady: false });
  },

  /** 战报图：Canvas 2D 绘制 */
  drawPoster(report: WeeklyReport) {
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0]?.node as WechatMiniprogram.Canvas | undefined;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      ctx.scale(dpr, dpr);

      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      grad.addColorStop(0, '#2D9D78');
      grad.addColorStop(1, '#4FC3A1');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('青沐 · 跑群周报', CANVAS_WIDTH / 2, 80);

      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(report.groupName, CANVAS_WIDTH / 2, 160);

      ctx.font = '24px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`${report.startDate} ~ ${report.endDate}`, CANVAS_WIDTH / 2, 200);

      this.drawRoundRect(ctx, 60, 250, CANVAS_WIDTH - 120, 200, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('本周战报', 90, 300);

      const colW = (CANVAS_WIDTH - 120) / 3;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2D9D78';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(`${report.totalDistance}`, 60 + colW / 2, 380);
      ctx.fillText(`${report.totalCheckins}`, 60 + colW * 1.5, 380);
      ctx.fillText(`${report.totalMembers}`, 60 + colW * 2.5, 380);

      ctx.fillStyle = '#666';
      ctx.font = '22px sans-serif';
      ctx.fillText('总公里', 60 + colW / 2, 420);
      ctx.fillText('打卡数', 60 + colW * 1.5, 420);
      ctx.fillText('参与人数', 60 + colW * 2.5, 420);

      if (report.champion) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 本周冠军', 90, 510);
        this.drawRoundRect(ctx, 90, 530, CANVAS_WIDTH - 180, 80, 12);
        ctx.fillStyle = '#FFF8E1';
        ctx.fill();
        ctx.fillStyle = '#FF6B35';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(report.champion.nickname, 110, 580);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF6B35';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(`${report.champion.distance} km`, CANVAS_WIDTH - 110, 580);
      }

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🏃 群英榜 Top 5', 90, 670);

      const top5 = report.topMembers.slice(0, 5);
      top5.forEach((m, i) => {
        const y = 720 + i * 70;
        this.drawRoundRect(ctx, 90, y, CANVAS_WIDTH - 180, 60, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = i === 0 ? '#FF6B35' : '#999';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${m.rank}`, 130, y + 40);
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(m.nickname, 170, y + 40);
        ctx.fillStyle = '#2D9D78';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${m.distance} km`, CANVAS_WIDTH - 110, y + 40);
      });

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('青沐生命科技 · 扫码加入我们', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50);
    });
  },

  drawRoundRect(
    ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  async onSavePoster() {
    if (!this.data.canvasReady) {
      wx.showToast({ title: '战报图未就绪', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const query = wx.createSelectorQuery();
      const canvas = await new Promise<WechatMiniprogram.Canvas>((resolve) => {
        query.select('#posterCanvas').node().exec((res) => resolve(res[0]?.node as WechatMiniprogram.Canvas));
      });
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        wx.canvasToTempFilePath(
          { canvas, success: (r) => resolve(r.tempFilePath), fail: reject },
          this,
        );
      });
      await new Promise<void>((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: tempFilePath, success: () => resolve(), fail: reject });
      });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      const msg = (err as WechatMiniprogram.GeneralCallbackResult).errMsg ?? '';
      if (msg.includes('auth deny')) {
        wx.showModal({ title: '提示', content: '需要您授权保存到相册', confirmText: '去设置' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },

  onSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: ['WEEKLY_REPORT_TPL_ID'],
      success: (res) => {
        if (res['WEEKLY_REPORT_TPL_ID'] === 'accept') {
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } else {
          wx.showToast({ title: '已拒绝', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '订阅失败（需模板 ID）', icon: 'none' });
      },
    });
  },
});
