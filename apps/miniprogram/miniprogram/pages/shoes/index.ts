// pages/shoes/index.ts — 我的跑鞋（V0.1.143 合并 shoes-detail + shoes-compare）
// 列表 + 点击展开详情（阈值/里程曲线）+ 对比弹层 + 添加 + 退役 + 成就
import { api } from '../../services/api';

interface Shoe {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  currentKm: number;
  thresholdKm: number;
  status: string;
  purchasedAt: string | null;
  note: string | null;
  healthRatio: number;
  createdAt: string;
}

interface ShoeStats {
  total: number;
  activeCount: number;
  retiredCount: number;
  totalKm: number;
  retiringSoonCount: number;
}

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

interface ShoeCompare {
  id: string;
  brand: string;
  model: string;
  nickname: string | null;
  status: string;
  currentKm: number;
  thresholdKm: number;
  healthRatio: number;
  checkinCount: number;
  daysSincePurchase: number | null;
  purchasedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCert = any;

const DEFAULT_THRESHOLD = 800;

Page({
  data: {
    shoes: [] as Shoe[],
    stats: {
      total: 0,
      activeCount: 0,
      retiredCount: 0,
      totalKm: 0,
      retiringSoonCount: 0,
    } as ShoeStats,
    loading: false,
    // V0.1.137 跑鞋成就
    achievements: null as null | {
      shoesMilestones: { currentTotalKm: number; achieved: AnyCert[]; next: AnyCert };
      shoeDays: { currentTotalDays: number; achieved: AnyCert[]; next: AnyCert };
      shoeCheckin: { currentTotalCheckins: number; achieved: AnyCert[]; next: AnyCert };
    },
    // 添加弹层
    formVisible: false,
    form: {
      brand: '',
      model: '',
      nickname: '',
      thresholdKm: DEFAULT_THRESHOLD,
    },
    submitting: false,
    // 展开详情（合并自 shoes-detail）
    selectedShoeId: '' as string,
    detail: null as ShoeDetail | null,
    mileageHistory: null as MileageHistory | null,
    period: 'weekly' as 'weekly' | 'monthly',
    thresholdDraft: DEFAULT_THRESHOLD,
    savingThreshold: false,
    chartWidth: 320,
    chartHeight: 180,
    detailLoading: false,
    // 对比弹层（合并自 shoes-compare）
    compareVisible: false,
    compareLoading: false,
    compareShoes: [] as ShoeCompare[],
    compareRows: [] as Array<{ label: string; values: (string | number)[]; winnerIdx: number | null }>,
  },

  onShow() {
    this.loadShoes();
  },

  /** 拉取跑鞋列表 + 统计 + 成就 */
  async loadShoes() {
    this.setData({ loading: true });
    try {
      const [listRes, statsRes, certRes] = await Promise.all([
        api.call<{ shoes: Shoe[] }>('shoes', 'list', {}),
        api.call<ShoeStats>('shoes', 'myStats', {}),
        api.call<{
          shoesMilestonesCert: AnyCert;
          shoeDaysMilestonesCert: AnyCert;
          shoeCheckinMilestonesCert: AnyCert;
        }>('stats', 'myCertificates', {}),
      ]);
      this.setData({
        shoes: listRes.shoes,
        stats: statsRes,
        loading: false,
        achievements: {
          shoesMilestones: certRes.shoesMilestonesCert,
          shoeDays: certRes.shoeDaysMilestonesCert,
          shoeCheckin: certRes.shoeCheckinMilestonesCert,
        },
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 点击跑鞋卡 → toggle 展开详情（V0.1.143 合并 shoes-detail，不跳页）*/
  async onTapShoe(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    if (this.data.selectedShoeId === id) {
      this.setData({ selectedShoeId: '', detail: null, mileageHistory: null });
      return;
    }
    this.setData({ selectedShoeId: id, detail: null, mileageHistory: null });
    await this.loadShoeDetail(id);
  },

  /** 计算 Canvas 尺寸（按屏宽 86% - padding） */
  computeChartSize() {
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const w = sys.windowWidth || 375;
      this.setData({ chartWidth: Math.floor(w * 0.86), chartHeight: 180 });
    } catch {
      // 容错：保持默认
    }
  },

  /** 加载单双详情 + 里程历史 */
  async loadShoeDetail(id: string) {
    this.setData({ detailLoading: true });
    try {
      const [detail, mileageHistory] = await Promise.all([
        api.call<ShoeDetail>('shoes', 'getDetail', { id }),
        api.call<MileageHistory>('shoes', 'getMileageHistory', { id }),
      ]);
      this.computeChartSize();
      this.setData({
        detail,
        mileageHistory,
        thresholdDraft: detail.thresholdKm,
        period: 'weekly',
        detailLoading: false,
      });
    } catch (e) {
      console.error('[shoes] loadDetail failed', e);
      this.setData({ detailLoading: false });
      wx.showToast({ title: '详情加载失败', icon: 'none' });
    }
  },

  /** 阈值滑块拖动中 */
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
        id: this.data.selectedShoeId,
        thresholdKm: newThreshold,
      });
      await this.loadShoeDetail(this.data.selectedShoeId);
      this.loadShoes(); // 刷新列表（healthRatio 变）
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      console.error('[shoes] updateThreshold failed', err);
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

  /** V0.1.143 对比弹层（合并 shoes-compare，不跳页）*/
  async onComparePick() {
    const activeShoes = this.data.shoes.filter((s) => s.status === 'active');
    if (activeShoes.length < 2) {
      wx.showToast({ title: '至少需要 2 双活跃跑鞋', icon: 'none' });
      return;
    }
    const [a, b] = activeShoes;
    this.setData({ compareVisible: true, compareLoading: true });
    try {
      const r = await api.call<{ shoes: ShoeCompare[] }>('shoes', 'compareShoes', { ids: [a.id, b.id] });
      this.setData({ compareShoes: r.shoes, compareLoading: false });
      this.computeCompareRows(r.shoes);
    } catch {
      this.setData({ compareLoading: false });
      wx.showToast({ title: '对比失败', icon: 'none' });
    }
  },

  /** 计算对比行 + 胜出索引 */
  computeCompareRows(shoes: ShoeCompare[]) {
    if (shoes.length !== 2) return;
    const [a, b] = shoes;
    const rows: Array<{ label: string; values: (string | number)[]; winnerIdx: number | null }> = [
      { label: '品牌', values: [a.brand, b.brand], winnerIdx: null },
      { label: '型号', values: [a.model, b.model], winnerIdx: null },
      { label: '昵称', values: [a.nickname || '-', b.nickname || '-'], winnerIdx: null },
      {
        label: '状态',
        values: [a.status === 'active' ? '使用中' : '已退役', b.status === 'active' ? '使用中' : '已退役'],
        winnerIdx: null,
      },
      {
        label: '累计里程',
        values: [`${a.currentKm} km`, `${b.currentKm} km`],
        winnerIdx: a.currentKm > b.currentKm ? 0 : b.currentKm > a.currentKm ? 1 : null,
      },
      {
        label: '健康度',
        values: [`${a.healthRatio}%`, `${b.healthRatio}%`],
        winnerIdx: a.healthRatio < b.healthRatio ? 0 : b.healthRatio < a.healthRatio ? 1 : null,
      },
      {
        label: '打卡数',
        values: [a.checkinCount, b.checkinCount],
        winnerIdx: a.checkinCount > b.checkinCount ? 0 : b.checkinCount > a.checkinCount ? 1 : null,
      },
      { label: '持有天数', values: [a.daysSincePurchase ?? '-', b.daysSincePurchase ?? '-'], winnerIdx: null },
    ];
    this.setData({ compareRows: rows });
  },

  closeCompare() {
    this.setData({ compareVisible: false });
  },

  /** 打开添加弹层 */
  onAdd() {
    this.setData({
      formVisible: true,
      form: { brand: '', model: '', nickname: '', thresholdKm: DEFAULT_THRESHOLD },
    });
  },

  /** 表单输入（动态字段） */
  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof typeof this.data.form;
    const value = e.detail.value;
    this.setData({ form: { ...this.data.form, [field]: value } });
  },

  /** 添加弹层阈值 slider 拖动 */
  onFormThresholdChanging(e: WechatMiniprogram.SliderChanging) {
    this.setData({ form: { ...this.data.form, thresholdKm: e.detail.value } });
  },

  /** 提交添加 */
  async onSubmit() {
    const { brand, model, nickname, thresholdKm } = this.data.form;
    if (!brand.trim() || !model.trim()) {
      wx.showToast({ title: '品牌和型号必填', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.call('shoes', 'add', {
        brand: brand.trim(),
        model: model.trim(),
        nickname: nickname.trim() || undefined,
        thresholdKm,
      });
      this.setData({ submitting: false, formVisible: false });
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.loadShoes();
    } catch {
      this.setData({ submitting: false });
      wx.showToast({ title: '添加失败', icon: 'none' });
    }
  },

  closeForm() {
    this.setData({ formVisible: false });
  },

  /** 退役跑鞋 */
  onRetire(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const shoe = this.data.shoes.find((s) => s.id === id);
    if (!shoe) return;
    const name = shoe.nickname || `${shoe.brand} ${shoe.model}`;
    wx.showModal({
      title: '退役跑鞋',
      content: `将「${name}」退役？退役后不再计入活跃跑鞋，但保留历史打卡里程。`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('shoes', 'retire', { id });
          wx.showToast({ title: '已退役', icon: 'success' });
          this.loadShoes();
        } catch {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
