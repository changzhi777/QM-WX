// components/invite-bonus-card — 3 列邀请奖励卡（V0.2.9 prototype 借鉴）
// 用途：mine 页用户卡下、level-card 上方，简短展示「邀请好友，双方得奖励」3 列
// 3 列：「+7 天」邀请人会员 / 「+50」邀请人积分 / 「+3 天」好友体验
Component({
  properties: {
    inviterDays:    { type: Number, value: 7 },   // 邀请人获得会员天数
    inviterPoints:  { type: Number, value: 50 },  // 邀请人获得积分
    inviteeDays:    { type: Number, value: 3 },   // 被邀请人获得体验天数
  },
  data: {},
  methods: {
    /** 点击 → 跳 membership 页（邀请码 + 兑换 + 完整奖励规则） */
    onTap() {
      this.triggerEvent('tap');
    },
  },
});
