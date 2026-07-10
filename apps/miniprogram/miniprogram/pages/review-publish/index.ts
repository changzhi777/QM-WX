// pages/review-publish/index.ts — 发表评价（V0.1.113 电商闭环）
// 入口：order-list 完成订单「去评价」→ navigateTo ?productId=x&orderId=y&productName=z
import { api } from '../../services/api';

Page({
  data: {
    productId: '',
    orderId: '',
    productName: '商品',
    rating: 5,
    content: '',
    images: [] as string[],
    submitting: false,
  },

  onLoad(query) {
    const productId = (query?.productId as string) ?? '';
    const orderId = (query?.orderId as string) ?? '';
    const productName = (query?.productName as string) ?? '商品';
    this.setData({ productId, orderId, productName });
    wx.setNavigationBarTitle({ title: '评价' });
  },

  /** 选星（1-5） */
  onPickStar(e: WechatMiniprogram.CustomEvent) {
    this.setData({ rating: Number(e.currentTarget.dataset.star) });
  },

  onContentInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ content: ((e.detail.value as string) ?? '').slice(0, 500) });
  },

  /** 选图 + 上传（最多 9 张） */
  async onChooseImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多 9 张', icon: 'none' });
      return;
    }
    const res = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>(
      (resolve, reject) => {
        wx.chooseMedia({ count: remain, mediaType: ['image'], success: resolve, fail: reject });
      },
    ).catch(() => null);
    if (!res || res.tempFiles.length === 0) return;

    wx.showLoading({ title: '上传中', mask: true });
    try {
      const uploaded: string[] = [];
      for (const f of res.tempFiles) {
        const url = await api.uploadFile(f.tempFilePath, 'image');
        uploaded.push(url);
      }
      this.setData({ images: [...this.data.images, ...uploaded] });
    } catch {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  /** 删图（点图移除） */
  onRemoveImage(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ images: this.data.images.filter((_, i) => i !== idx) });
  },

  async onSubmit() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请写点评价吧', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('review', 'create', {
        productId: this.data.productId,
        orderId: this.data.orderId,
        rating: this.data.rating,
        content: this.data.content,
        images: this.data.images,
      });
      wx.showToast({ title: '评价成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch {
      // api.call 已 toast 业务错误
    } finally {
      this.setData({ submitting: false });
    }
  },
});
