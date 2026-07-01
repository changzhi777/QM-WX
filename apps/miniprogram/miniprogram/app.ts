// app.ts
import { API_BASE } from '@qm-wx/shared/api-contracts';

App({
  globalData: {
    user: null as null | {
      id: string;
      openid: string;
      nickname: string | null;
      points: number;
    },
    accessToken: '' as string,
    config: null as null | {
      featureFlags: Record<string, boolean>;
      memberLevels: Record<string, unknown>;
      pointsRules: Record<string, number>;
    },
    needPrivacyAgree: false,
  },

  async onLaunch() {
    // 1. 注入 baseUrl
    //    🔧 临时：开发态也连云后端（qingmulife.cn）测佳明真实数据
    //    TODO：本地起 server 后恢复 envVersion 分支（develop→localhost / trial,release→prod）
    (wx as unknown as { $apiBase: string }).$apiBase = API_BASE.prod;

    // 2. 检查隐私协议（提审要求首启弹）
    if (!wx.getStorageSync('privacyAgreed')) {
      this.globalData.needPrivacyAgree = true;
    }

    // 3. 🔧 临时默认登录「张晨」（先跑通佳明真实数据；后改正经微信登录 + 用户切换）
    //    token 由云后端 JWT_SECRET 签发（payload {id: 张晨userId}），无 exp 长效便于开发态联调
    //    TODO：接入真实微信 wx.login → user.login 后删除本段，恢复 silentLogin()
    this.globalData.user = {
      id: 'cmqz1y60x0000o5a2pp4p5cj3',
      openid: 'seed-zhangchen-001',
      nickname: '张晨',
      points: 50,
    } as never;
    this.globalData.accessToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtcXoxeTYweDAwMDBvNWEycHA0cDVjajMifQ.q3M1aLp-F6LiZO3cGw3tEU8pPkTEnqCGdO8EHRCmBDw';
    this.globalData.config = {
      featureFlags: { wallet: false, payment: false, membershipPurchase: false, smartAgent: false, bindApp: false },
      memberLevels: {},
      pointsRules: {},
    } as never;
    wx.setStorageSync('accessToken', this.globalData.accessToken);
    wx.setStorageSync('currentUser', this.globalData.user);
    // silentLogin 暂停（默认张晨已设）；后改微信登录时恢复下方调用
    // silentLogin().catch(() => {});
  },
});
