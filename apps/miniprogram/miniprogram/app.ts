// app.ts
import { silentLogin } from './utils/auth';
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
    // 1. 注入 baseUrl（微信小程序无 process.env，用 envVersion 判断环境）
    const accountInfo = wx.getAccountInfoSync();
    const isProd = accountInfo.miniProgram.envVersion === 'release';
    (wx as unknown as { $apiBase: string }).$apiBase =
      isProd ? API_BASE.prod : API_BASE.dev;

    // 2. 检查隐私协议（提审要求首启弹）
    if (!wx.getStorageSync('privacyAgreed')) {
      this.globalData.needPrivacyAgree = true;
    }

    // 3. 静默登录（不阻塞）
    silentLogin().catch(() => {
      // 静默失败 OK
    });
  },
});
