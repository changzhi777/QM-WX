// pages/points/index.ts — 积分中心（参考图 2763）
import { api } from '../../services/api';

interface PointsRecord {
  type: string;
  change: number;
  balance: number;
  createdAt: string;
}
interface Task {
  key: string;
  title: string;
  points: number;
  route: string;
  done: boolean;
}

Page({
  data: {
    balance: 0,
    todaySigned: false,
    continuousDays: 0,
    records: [] as PointsRecord[],
    tasks: [] as Task[],
    loading: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [balance, tasks] = await Promise.all([
        api.call<{ balance: number; todaySigned: boolean; continuousDays: number; records: PointsRecord[] }>('points', 'myBalance', {}),
        api.call<{ tasks: Task[] }>('points', 'myTasks', {}),
      ]);
      this.setData({
        balance: balance.balance,
        todaySigned: balance.todaySigned,
        continuousDays: balance.continuousDays,
        records: balance.records.map((r) => ({ ...r, createdAt: r.createdAt.slice(0, 16).replace('T', ' ') })),
        tasks: tasks.tasks,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  async signin() {
    if (this.data.todaySigned) return;
    try {
      const res = await api.call<{ pointsAwarded: number; continuousDays: number; newBalance: number; bonus: boolean }>('points', 'signin', {});
      wx.showToast({ title: `+${res.pointsAwarded} 积分${res.bonus ? '（7天奖励）' : ''}`, icon: 'none' });
      this.load();
    } catch {
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },

  goTask(e: WechatMiniprogram.TouchEvent) {
    const route = e.currentTarget.dataset.route as string;
    if (route) wx.navigateTo({ url: route });
  },
});
