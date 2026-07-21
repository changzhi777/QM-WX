/** V0.2.6 会员中心（邀请裂变）+ V0.2.7 成长等级 + 积分兑换 */
import { api } from '../../services/api';

// V0.2.7 成长等级门槛（与后端 deriveGrowthLevel 一致：free<100/青铜100/白银500/黄金2000/钻石5000）
const GROWTH_LEVELS = [
  { level: 'diamond', name: '钻石', min: 5000, icon: '💎' },
  { level: 'gold', name: '黄金', min: 2000, icon: '🥇' },
  { level: 'silver', name: '白银', min: 500, icon: '🥈' },
  { level: 'bronze', name: '青铜', min: 100, icon: '🥉' },
] as const;

// V0.2.7 积分兑换套餐（与后端 REDEEM_PACKAGES 一致）
const REDEEM_PACKAGES = [
  { days: 7, pointsCost: 100 },
  { days: 30, pointsCost: 300 },
];

type GrowthInfo = {
  name: string;
  icon: string;
  progress: number;
  toNext: number;
  nextName: string;
};

/** 按累计积分算当前等级 + 进度 + 距下一级 */
function computeGrowth(total: number): GrowthInfo {
  const idx = GROWTH_LEVELS.findIndex((g) => total >= g.min);
  if (idx === -1) {
    const bronze = GROWTH_LEVELS[3];
    return {
      name: '新手',
      icon: '🌱',
      progress: Math.min(100, Math.round((total / bronze.min) * 100)),
      toNext: bronze.min - total,
      nextName: bronze.name,
    };
  }
  const cur = GROWTH_LEVELS[idx];
  const next = idx > 0 ? GROWTH_LEVELS[idx - 1] : null;
  if (!next) return { name: cur.name, icon: cur.icon, progress: 100, toNext: 0, nextName: '已满级' };
  const progress = Math.round(((total - cur.min) / (next.min - cur.min)) * 100);
  return { name: cur.name, icon: cur.icon, progress, toNext: next.min - total, nextName: next.name };
}

Page({
  data: {
    inviteCode: '',
    memberExpireAt: null as string | null,
    points: 0,
    isMember: false,
    totalPointsEarned: 0,
    growth: null as GrowthInfo | null,
    packages: REDEEM_PACKAGES,
    loading: true,
  },

  async onLoad() {
    try {
      const [info, meRes] = await Promise.all([
        api.call<{ inviteCode: string }>('distribution', 'inviteInfo'),
        api.call<{
          user: {
            memberExpireAt: string | null;
            points: number;
            memberLevel: string;
            totalPointsEarned: number;
            growthLevel: string;
          };
        }>('user', 'me'),
      ]);
      const u = meRes.user;
      const total = u?.totalPointsEarned ?? 0;
      this.setData({
        inviteCode: info.inviteCode ?? '',
        memberExpireAt: u?.memberExpireAt ?? null,
        points: u?.points ?? 0,
        isMember: !!u && u.memberLevel !== 'free',
        totalPointsEarned: total,
        growth: computeGrowth(total),
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
    }
  },

  /** 复制邀请码 */
  onCopyCode() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({ data: this.data.inviteCode });
  },

  /** V0.2.7 积分兑换会员时长（扣积分 + 续期，后端套餐校验）*/
  async onRedeem(e: WechatMiniprogram.CustomEvent) {
    const days = e.currentTarget.dataset.days as number;
    try {
      await api.call('user', 'redeemMember', { days });
      wx.showToast({ title: '兑换成功', icon: 'success' });
      await this.onLoad(); // 刷新积分/会员状态
    } catch (err) {
      wx.showToast({ title: (err as Error)?.message || '兑换失败', icon: 'none' });
    }
  },

  /** 分享带邀请码（裂变追踪）*/
  onShareAppMessage() {
    const code = this.data.inviteCode;
    return {
      title: '一起来沐禾健康，邀请好友解锁完整健康解读 🏃',
      path: '/pages/index/index' + (code ? `?inviterCode=${code}` : ''),
    };
  },
});
