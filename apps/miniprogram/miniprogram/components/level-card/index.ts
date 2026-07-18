// components/level-card — 紫色等级卡（V0.2.9 prototype 借鉴）
// 我的页顶部紫色渐变卡：当前 growthLevel emoji + 「累计等级 X」+ 进度条 + 「距下一级 X 积分」
// 复用 avatar-badge growthLevel 映射（free/bronze/silver/gold/diamond）+ 后端 deriveGrowthLevel 门槛
Component({
  properties: {
    growthLevel: { type: String, value: 'free' },  // free/bronze/silver/gold/diamond
    totalPointsEarned: { type: Number, value: 0 },
    nickname: { type: String, value: '跑者' },
    avatar: { type: String, value: '🏃' },          // V0.2.32 融合 user-card：头像 emoji
    memberLevel: { type: String, value: 'free' },   // V0.2.32 融合：会员等级（≠free 显👑皇冠）
  },
  data: {
    icon: '🌱',
    label: '入门',
    progress: 0,           // 0-100 百分比
    nextLevel: 'bronze',
    nextLevelLabel: '青铜',
    nextLevelThreshold: 100,
    pointsToNext: 0,
  },
  observers: {
    'growthLevel, totalPointsEarned'(growthLevel: string, total: number) {
      const map: Record<string, { icon: string; label: string; threshold: number; next: string }> = {
        free:    { icon: '🌱', label: '入门',     threshold: 0,    next: 'bronze' },
        bronze:  { icon: '🥉', label: '青铜学员', threshold: 100,  next: 'silver' },
        silver:  { icon: '🥈', label: '白银学员', threshold: 500,  next: 'gold' },
        gold:    { icon: '🥇', label: '黄金学员', threshold: 2000, next: 'diamond' },
        diamond: { icon: '💎', label: '钻石学员', threshold: 5000, next: '' },
      };
      const cur = map[growthLevel] ?? map.free;
      let progress = 100;
      let pointsToNext = 0;
      let nextLevel: string = '';
      let nextLevelThreshold = cur.threshold;
      let nextLevelLabel = '';
      if (cur.next) {
        const next = map[cur.next];
        nextLevel = cur.next;
        nextLevelLabel = next.label;
        nextLevelThreshold = next.threshold;
        progress = Math.min(100, Math.max(0, Math.round((total - cur.threshold) / (next.threshold - cur.threshold) * 100)));
        pointsToNext = Math.max(0, next.threshold - total);
      }
      this.setData({
        icon: cur.icon,
        label: cur.label,
        progress,
        nextLevel,
        nextLevelLabel,
        nextLevelThreshold,
        pointsToNext,
      });
    },
  },
});
