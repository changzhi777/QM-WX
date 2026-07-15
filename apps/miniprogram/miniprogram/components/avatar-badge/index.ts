/** V0.2.7 头像双标识组件：付费皇冠（memberLevel≠free）+ 成长等级徽章 */
Component({
  properties: {
    memberLevel: { type: String, value: 'free' },
    growthLevel: { type: String, value: 'free' },
  },
  data: {
    isMember: false,
    levelIcon: '',
    levelClass: '',
  },
  observers: {
    'memberLevel, growthLevel'(memberLevel: string, growthLevel: string) {
      const map: Record<string, { icon: string; cls: string }> = {
        diamond: { icon: '💎', cls: 'lv-diamond' },
        gold: { icon: '🥇', cls: 'lv-gold' },
        silver: { icon: '🥈', cls: 'lv-silver' },
        bronze: { icon: '🥉', cls: 'lv-bronze' },
      };
      const lv = map[growthLevel] ?? { icon: '', cls: '' };
      this.setData({
        isMember: memberLevel !== 'free',
        levelIcon: lv.icon,
        levelClass: lv.cls,
      });
    },
  },
});
