// pages/order-confirm/index.ts
import { api } from '../../services/api';

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  stock: number;
}

Page({
  data: {
    product: null as Product | null,
    quantity: 1,
    pointsInput: '',
    usePoints: false, // 用户勾选
    address: { name: '', phone: '', detail: '' },
    totalAmount: '0.00',
    pointsUsed: 0,
    payAmount: '0.00',
    submitting: false,
    canPay: false, // 来自 feature flag
    error: false,
    errorMsg: '',
  },

  onLoad(query) {
    const productId = (query?.productId as string) ?? '';
    const quantity = Number((query?.quantity as string) ?? '1');
    (this as unknown as { _productId: string })._productId = productId;
    this.setData({ quantity });
    this.loadProduct(productId);

    const flags = (getApp().globalData.config?.featureFlags ?? {}) as { payment?: boolean };
    this.setData({ canPay: !!flags.payment });
  },

  /** error-state 重试入口 */
  loadRetry() {
    const id = (this as unknown as { _productId?: string })._productId;
    if (id) this.loadProduct(id);
  },

  async loadProduct(id: string) {
    this.setData({ error: false, errorMsg: '' });
    try {
      const { product } = await api.call<{ product: Product }>('mall', 'productDetail', { id });
      this.setData({ product });
      this.recalc();
    } catch (e) {
      this.setData({
        error: true,
        errorMsg: (e as Error).message ?? '加载商品失败',
      });
    }
  },

  onToggleUsePoints(e: WechatMiniprogram.CustomEvent) {
    this.setData({ usePoints: e.detail.value.length > 0 });
    this.recalc();
  },

  onPointsInput(e: WechatMiniprogram.CustomEvent) {
    this.setData({ pointsInput: e.detail.value });
    this.recalc();
  },

  onAddrName(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'address.name': e.detail.value });
  },
  onAddrPhone(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'address.phone': e.detail.value });
  },
  onAddrDetail(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'address.detail': e.detail.value });
  },

  recalc() {
    const { product, quantity, usePoints, pointsInput } = this.data;
    if (!product) return;
    const total = Number(product.price) * quantity;
    const maxPoints = Math.floor(total / 0.01);
    const points = usePoints ? Math.min(Number(pointsInput) || 0, maxPoints) : 0;
    const pointsValue = points * 0.01;
    const pay = Math.max(0, total - pointsValue);
    this.setData({
      totalAmount: total.toFixed(2),
      pointsUsed: points,
      payAmount: pay.toFixed(2),
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.product) return;

    // 简单地址校验（不强制，但鼓励填）
    const { address, usePoints, pointsInput, product, quantity, canPay } = this.data;

    this.setData({ submitting: true });
    try {
      const result = await api.call<{ orderId: string; status: string; message: string }>(
        'mall',
        'createOrder',
        {
          items: [{ productId: product.id, qty: quantity }],
          address: address.name ? address : undefined,
          pointsUsed: usePoints ? Number(pointsInput) || 0 : 0,
        },
      );

      wx.showModal({
        title: result.status === 'paid' ? '兑换成功' : '订单已创建',
        content: result.message,
        showCancel: false,
        success: () => {
          // 跳到我的订单
          wx.switchTab({ url: '/pages/mine/index' });
          setTimeout(() => wx.navigateTo({ url: '/pages/order-list/index' }), 100);
        },
      });

      void canPay; // 暂未用，支付功能开通时用
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
