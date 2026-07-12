/**
 * pages/admin-race-result/index — admin 录入赛事成绩（V0.1.134）
 *
 * admin openid 鉴权 + 选 contentId（赛事列表） + 列表该赛事 enrollment + 录入表单
 */
import { api } from '../../services/api';

interface Enrollment {
  id: string;
  userId: string;
  user: {
    id: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  status: string;
}

interface RaceResult {
  id: string;
  enrollmentId: string;
  finishTimeSec: number | null;
  paceSecPerKm: number | null;
  rank: number | null;
  bibNumber: string | null;
  finisherPhotoUrl: string | null;
  source: string;
}

Page({
  data: {
    isAdmin: false,
    loading: true,
    contentId: '', // 当前选中的赛事
    enrollments: [] as Array<Enrollment & { raceResult?: RaceResult | null }>,
    selectedEnrollment: null as (Enrollment & { raceResult?: RaceResult | null }) | null,
    showForm: false,
    form: {
      finishTimeSec: 0,
      rank: 0,
      bibNumber: '',
    },
    submitting: false,
  },

  async onLoad() {
    // admin openid 鉴权：调 admin.listAdmins（仅白名单 openid 能调，非 admin 返 403）
    try {
      await api.call('admin', 'listAdmins', {});
      this.setData({ isAdmin: true });
    } catch {
      wx.showToast({ title: '需要 admin 权限', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
  },

  /**
   * 加载该赛事所有 enrollment + 已有 race result（admin.listEnrollmentsByContent 一次拿全）
   */
  async loadEnrollments(contentId: string) {
    this.setData({ loading: true });
    try {
      const r = await api.call<{ enrollments: Array<Enrollment & { raceResult: RaceResult | null }> }>(
        'admin',
        'listEnrollmentsByContent',
        { contentId },
      );
      this.setData({ enrollments: r.enrollments, contentId, loading: false });
    } catch (e) {
      console.error('[admin-race-result] load failed', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 选赛事（弹层选择） */
  onPickContent() {
    wx.showModal({
      title: '请输入赛事 ID',
      content: 'MVP 简化版：粘贴赛事 ID 直接加载（生产可改 picker）',
      editable: true,
      success: (r) => {
        if (r.confirm && r.content) {
          this.loadEnrollments(r.content.trim());
        }
      },
    });
  },

  /** 点 enrollment → 录入表单 */
  onTapEnrollment(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const selected = this.data.enrollments.find((e2) => e2.id === id);
    if (!selected) return;
    const initialForm = {
      finishTimeSec: selected.raceResult?.finishTimeSec ?? 0,
      rank: selected.raceResult?.rank ?? 0,
      bibNumber: selected.raceResult?.bibNumber ?? '',
    };
    this.setData({ selectedEnrollment: selected, showForm: true, form: initialForm });
  },

  onInputTime(e: WechatMiniprogram.Input) {
    this.setData({ 'form.finishTimeSec': Number(e.detail.value) || 0 });
  },
  onInputRank(e: WechatMiniprogram.Input) {
    this.setData({ 'form.rank': Number(e.detail.value) || 0 });
  },
  onInputBib(e: WechatMiniprogram.Input) {
    this.setData({ 'form.bibNumber': e.detail.value });
  },

  async onSubmit() {
    const sel = this.data.selectedEnrollment;
    if (!sel) return;
    const { finishTimeSec, rank, bibNumber } = this.data.form;
    if (!finishTimeSec || finishTimeSec <= 0) {
      wx.showToast({ title: '请输入完赛时间', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('admin', 'submitRaceResult', {
        enrollmentId: sel.id,
        finishTimeSec,
        rank: rank > 0 ? rank : undefined,
        bibNumber: bibNumber.trim() || undefined,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ showForm: false, selectedEnrollment: null });
      // 刷新列表
      if (this.data.contentId) {
        await this.loadEnrollments(this.data.contentId);
      }
    } catch (err) {
      console.error('[admin-race-result] submit failed', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  closeForm() {
    this.setData({ showForm: false, selectedEnrollment: null });
  },

  onPullDownRefresh() {
    if (this.data.contentId) {
      this.loadEnrollments(this.data.contentId).then(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  /** 格式化秒 → "Xh Ym" */
  formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h${m}m`;
    if (m > 0) return `${m}m${s}s`;
    return `${s}s`;
  },
});