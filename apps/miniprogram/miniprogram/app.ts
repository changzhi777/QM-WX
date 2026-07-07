// app.ts
import { API_BASE } from '@qm-wx/shared/api-contracts';
import { silentLogin } from './utils/auth';

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
    // 1. 注入 baseUrl（生产 qingmulife.cn）
    //    TODO：本地起 server 后恢复 envVersion 分支（develop→localhost / trial,release→prod）
    (wx as unknown as { $apiBase: string }).$apiBase = API_BASE.prod;

    // 2. 检查隐私协议（提审要求首启弹）
    if (!wx.getStorageSync('privacyAgreed')) {
      this.globalData.needPrivacyAgree = true;
    }

    // 3. 静默登录（恢复 cached token + 拉 user/config；首次启动无 token 则等业务页 ensureLogin 兜底）
    //    V0.1.39：恢复真登录（删 hardcoded 张晨，GAP-5 关闭）
    silentLogin().catch(() => {});
  },
});
