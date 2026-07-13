/**
 * pages/shoes-compare/index — 跑鞋对比（V0.1.137）
 *
 * onLoad(options) 拿 ids=[s1,s2]，调 shoes.compareShoes 拉汇总
 * 横向对比表 + 胜出高亮
 */
import { api } from '../../services/api';

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

Page({
  data: {
    shoes: [] as ShoeCompare[],
    loading: true,
    rows: [] as Array<{ label: string; values: (string | number)[]; winnerIdx: number | null }>,
  },

  onLoad(options: { ids?: string }) {
    const ids = (options.ids || '').split(',').filter(Boolean);
    if (ids.length !== 2) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadCompare(ids);
  },

  async loadCompare(ids: string[]) {
    try {
      const r = await api.call<{ shoes: ShoeCompare[] }>('shoes', 'compareShoes', { ids });
      this.setData({ shoes: r.shoes, loading: false });
      this.computeRows(r.shoes);
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 计算每行 + 胜出索引 */
  computeRows(shoes: ShoeCompare[]) {
    if (shoes.length !== 2) return;
    const [a, b] = shoes;

    const rows: Array<{ label: string; values: (string | number)[]; winnerIdx: number | null }> = [
      {
        label: '品牌',
        values: [a.brand, b.brand],
        winnerIdx: null,
      },
      {
        label: '型号',
        values: [a.model, b.model],
        winnerIdx: null,
      },
      {
        label: '昵称',
        values: [a.nickname || '-', b.nickname || '-'],
        winnerIdx: null,
      },
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
      {
        label: '持有天数',
        values: [a.daysSincePurchase ?? '-', b.daysSincePurchase ?? '-'],
        winnerIdx: null,
      },
    ];
    this.setData({ rows });
  },

  onTapBack() {
    wx.navigateBack();
  },
});