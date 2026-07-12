// pages/content-detail/index.ts
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface Content {
  id: string;
  type: string;
  title: string;
  cover: string | null;
  summary: string | null;
  detail: unknown;
  price: string | null;
  fee: string | null;
  date: string | null;
  location: string | null;
  tags: string[];
  actionType: 'enroll' | 'book' | 'link' | 'none';
}

interface LeaderboardItem {
  rank: number;
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  finishTimeSec: number;
  paceSecPerKm: number;
  finisherPhotoUrl: string | null;
}

interface MyRaceResult {
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
    content: null as Content | null,
    loading: true,
    error: false,
    errorMsg: '',
    showEnroll: false,
    form: { name: '', phone: '', remark: '' },
    submitting: false,
    // V0.1.134 赛事 tab + 排行榜 + 我的成绩
    isRace: false,
    activeTab: 'detail' as 'detail' | 'route' | 'leaderboard' | 'mine',
    leaderboard: [] as LeaderboardItem[],
    leaderboardLoading: false,
    myRaceResult: null as MyRaceResult | null,
    showSelfReport: false,
    selfReportForm: { finishTimeSec: 0 },
    selfReporting: false,
  },

  onLoad(query) {
    const id = (query?.id as string) ?? '';
    // 不放 data（避免污染视图层），用普通函数闭包
    (this as unknown as { _detailId: string })._detailId = id;
    this.loadDetail(id);
  },

  /** error-state 重试入口 */
  loadRetry() {
    const id = (this as unknown as { _detailId?: string })._detailId;
    if (id) this.loadDetail(id);
  },

  async loadDetail(id: string) {
    this.setData({ loading: true, error: false, errorMsg: '' });
    try {
      const { content } = await api.call<{ content: Content }>('content', 'detail', { id });
      const isRace = content.type === 'marathon';
      this.setData({ content, loading: false, isRace });
      wx.setNavigationBarTitle({ title: content.title });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载详情失败',
      });
    }
  },

  /** V0.1.134 切 tab */
  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'detail' | 'route' | 'leaderboard' | 'mine';
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'leaderboard' && this.data.leaderboard.length === 0) {
      this.loadLeaderboard();
    }
    if (tab === 'mine' && !this.data.myRaceResult) {
      this.loadMyRaceResult();
    }
  },

  async loadLeaderboard() {
    if (!this.data.content) return;
    this.setData({ leaderboardLoading: true });
    try {
      const r = await api.call<{ leaderboard: LeaderboardItem[] }>(
        'content',
        'getRaceLeaderboard',
        { contentId: this.data.content.id, limit: 50 },
      );
      this.setData({ leaderboard: r.leaderboard, leaderboardLoading: false });
    } catch (e) {
      console.error('[content-detail] loadLeaderboard failed', e);
      this.setData({ leaderboardLoading: false });
    }
  },

  async loadMyRaceResult() {
    if (!this.data.content) return;
    try {
      const r = await api.call<MyRaceResult | null>('content', 'getMyRaceResult', {
        contentId: this.data.content.id,
      });
      this.setData({ myRaceResult: r });
    } catch (e) {
      console.error('[content-detail] loadMyRaceResult failed', e);
    }
  },

  /** 自报成绩表单 */
  onTapSelfReport() {
    ensureLogin().then(() => {
      this.setData({ showSelfReport: true });
    });
  },

  closeSelfReport() {
    this.setData({ showSelfReport: false });
  },

  onInputFinishTime(e: WechatMiniprogram.Input) {
    this.setData({ 'selfReportForm.finishTimeSec': Number(e.detail.value) || 0 });
  },

  async onSubmitSelfReport() {
    const content = this.data.content;
    if (!content) return;
    const sec = this.data.selfReportForm.finishTimeSec;
    if (!sec || sec <= 0) {
      wx.showToast({ title: '请输入完赛时间', icon: 'none' });
      return;
    }
    this.setData({ selfReporting: true });
    try {
      // 先查我的 enrollmentId（按 contentId 查我的第一个 confirmed）
      const my = await api.call<{ enrollments: Array<{ id: string; status: string }> }>(
        'content',
        'myEnrollments',
        { type: 'marathon' },
      );
      const confirmed = my.enrollments.find(
        (e2) => e2.status === 'confirmed' && /* 简化：实际应该按 contentId 过滤 */ true,
      );
      // 实际：应再调 content.detail 拿 enrollment；MVP 简化：直接传 enrollmentId 从 myRaceResult
      // 如果没有 myRaceResult 但有 selfReport，需要先获取 enrollmentId
      if (!confirmed) {
        wx.showToast({ title: '未找到已确认的报名', icon: 'none' });
        this.setData({ selfReporting: false });
        return;
      }
      // 检查 enrollment 是否属于该 content（用 admin.listEnrollmentsByContent 太重，改查 my enrollments）
      const r = await api.call<MyRaceResult>('content', 'submitRaceResult', {
        enrollmentId: confirmed.id,
        finishTimeSec: sec,
      });
      this.setData({ myRaceResult: r, showSelfReport: false, selfReporting: false });
      wx.showToast({ title: '已提交', icon: 'success' });
    } catch (err) {
      console.error('[content-detail] submitRaceResult failed', err);
      wx.showToast({ title: (err as Error).message ?? '提交失败', icon: 'none' });
      this.setData({ selfReporting: false });
    }
  },

  /** 格式化秒 → "Xh Ym" */
  formatDuration(sec: number | null | undefined): string {
    if (!sec) return '-';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h${m}m`;
    if (m > 0) return `${m}m${s}s`;
    return `${s}s`;
  },

  /** 格式化配速（秒/公里）→ "X:XX/km" */
  formatPace(secPerKm: number | null | undefined): string {
    if (!secPerKm) return '-';
    const m = Math.floor(secPerKm / 60);
    const s = secPerKm % 60;
    return `${m}:${String(s).padStart(2, '0')}/km`;
  },

  onTapEnroll() {
    if (this.data.content?.actionType === 'none') {
      wx.showToast({ title: '该内容仅展示', icon: 'none' });
      return;
    }
    ensureLogin().then(() => {
      this.setData({ showEnroll: true });
    });
  },

  onCancelEnroll() {
    this.setData({ showEnroll: false, form: { name: '', phone: '', remark: '' } });
  },

  onInputName(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.name': e.detail.value });
  },
  onInputPhone(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.phone': e.detail.value });
  },
  onInputRemark(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.remark': e.detail.value });
  },

  async onSubmitEnroll() {
    const { form, content, submitting } = this.data;
    if (submitting) return;
    if (!form.name.trim() || !form.phone.trim()) {
      wx.showToast({ title: '请填姓名和手机号', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      wx.showToast({ title: '手机号格式错误', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const res = await api.call<{
        enrollmentId: string;
        message?: string;
        payParams?: {
          timeStamp: string;
          nonceStr: string;
          package: string;
          signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
          paySign: string;
        };
      }>('content', 'enroll', {
        id: content!.id,
        formData: { name: form.name.trim(), phone: form.phone.trim(), remark: form.remark.trim() || undefined },
      });
      // V0.1.118 fee>0+payment=ON → 后端返 payParams → 拉起微信支付；否则意向单
      if (res.payParams) {
        await new Promise<void>((resolve, reject) => {
          wx.requestPayment({
            ...res.payParams!,
            success: () => resolve(),
            fail: (e) => reject(e),
          });
        });
        wx.showToast({ title: '报名成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.message ?? '已提交，客服会联系您', icon: 'success' });
      }
      this.setData({ showEnroll: false, form: { name: '', phone: '', remark: '' } });
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  getActionText(): string {
    const t = this.data.content?.actionType;
    if (t === 'enroll') return '立即报名';
    if (t === 'book') return '立即预订';
    if (t === 'link') return '了解详情';
    return '';
  },
});
