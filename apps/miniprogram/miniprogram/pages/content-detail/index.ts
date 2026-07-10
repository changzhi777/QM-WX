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

Page({
  data: {
    content: null as Content | null,
    loading: true,
    error: false,
    errorMsg: '',
    showEnroll: false,
    form: { name: '', phone: '', remark: '' },
    submitting: false,
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
      this.setData({ content, loading: false });
      wx.setNavigationBarTitle({ title: content.title });
    } catch (e) {
      this.setData({
        loading: false,
        error: true,
        errorMsg: (e as Error).message ?? '加载详情失败',
      });
    }
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
