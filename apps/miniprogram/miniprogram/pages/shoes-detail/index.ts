/**
 * pages/shoes-detail/index — 跑鞋详情（V0.1.133）
 *
 * 基础信息 + 阈值编辑器（slider）+ 累计统计 + 里程曲线（Canvas 手绘）+ 关联打卡列表
 */
import { api } from '../../services/api.js';

interface ShoeDetail {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  currentKm: number;
  thresholdKm: number;
  status: 'active' | 'retired';
  purchasedAt: string | null;
  note: string | null;
  healthRatio: number;
  createdAt: string;
  updatedAt: string;
  totalCheckins: number;
  latestCheckinAt: string | null;
  daysSincePurchase: number | null;
}

interface MileagePoint {
  period: string;
  distanceKm: number;
  checkinCount: number;
}

interface MileageHistory {
  weekly: MileagePoint[];
  monthly: MileagePoint[];
  totalKm: number;
  totalCheckins: number;
}

Page({
  data: {
    shoeId: '',
    detail: null as ShoeDetail | null,
    mileageHistory: null as MileageHistory | null,
    period: 'weekly' as 'weekly' | 'monthly',
    loading: true,
    empty: false,
    thresholdDraft: 800,
    savingThreshold: false,
    chartWidth: 320,
    chartHeight: 200,
  },

  async onLoad(options: { id?: string }) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ shoeId: options.id });
    this.computeChartSize();
    await this.loadAll();
  },

  /** 计算 Canvas 尺寸（按屏宽 90% - padding） */
  computeChartSize() {
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const w = sys.windowWidth || 375;
      this.setData({ chartWidth: Math.floor(w * 0.9), chartHeight: 200 });
    } catch {
      // 容错：保持默认 320x200
    }
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [detail, mileageHistory] = await Promise.all([
        api.call<ShoeDetail>('shoes', 'getDetail', { id: this.data.shoeId }),
        api.call<MileageHistory>('shoes', 'getMileageHistory', { id: this.data.shoeId }),
      ]);
      const empty = mileageHistory.totalCheckins === 0;
      this.setData({
        detail,
        mileageHistory,
        thresholdDraft: detail.thresholdKm,
        loading: false,
        empty,
      });
      wx.setNavigationBarTitle({ title: detail.nickname || `${detail.brand} ${detail.model}` });
    } catch (e) {
      console.error('[shoes-detail] loadAll failed', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 阈值滑块变化（拖动中） */
  onThresholdChanging(e: WechatMiniprogram.SliderChanging) {
    this.setData({ thresholdDraft: e.detail.value });
  },

  /** 阈值松手保存 */
  async onThresholdChange(e: WechatMiniprogram.SliderChange) {
    const newThreshold = e.detail.value;
    if (newThreshold === this.data.detail?.thresholdKm) return;
    this.setData({ savingThreshold: true });
    try {
      await api.call('shoes', 'updateThreshold', {
        id: this.data.shoeId,
        thresholdKm: newThreshold,
      });
      // 刷新详情（healthRatio 自动更新）
      await this.loadAll();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.error('[shoes-detail] updateThreshold failed', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingThreshold: false });
    }
  },

  /** 周期切换：weekly ↔ monthly */
  onPeriodChange(e: WechatMiniprogram.TouchEvent) {
    const period = (e.currentTarget.dataset.period as 'weekly' | 'monthly') || 'weekly';
    if (period === this.data.period) return;
    this.setData({ period });
  },

  /** 跳回跑鞋列表 */
  onTapBack() {
    wx.navigateBack();
  },
});