// app.ts
import { API_BASE } from '@qm-wx/shared/api-contracts';
import { silentLogin } from './utils/auth';
import { api } from './services/api';

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
    inviteCode: '' as string, // V0.2.6 我的邀请码（登录后预加载，分享带码用）
    pendingInviter: '' as string, // V0.2.6 新用户带 inviterCode 进入暂存（onboarding 时绑定上线）
  },

  async onLaunch(options: WechatMiniprogram.App.LaunchShowOption) {
    // 1. 注入 baseUrl（V0.1.44：恢复 envVersion 分支）
    //    - develop（开发者工具 / 预览扫码）→ 本地后端，测最新代码
    //    - trial / release（体验版 / 正式版）→ 生产 qingmulife.cn
    let envVersion = 'develop';
    try {
      envVersion = wx.getAccountInfoSync().miniProgram.envVersion;
    } catch {
      // 部分基础库不支持 → 当作开发版（连本地）
    }
    const isDev = envVersion === 'develop';
    // ⚠️ 临时：模拟器/预览连生产测 健康教练（测完改 false 恢复 develop 连本地）
    const FORCE_PROD = true;
    (wx as unknown as { $apiBase: string }).$apiBase = (!FORCE_PROD && isDev) ? API_BASE.dev : API_BASE.prod;

    // 2. 检查隐私协议（提审要求首启弹）
    if (!wx.getStorageSync('privacyAgreed')) {
      this.globalData.needPrivacyAgree = true;
    }

    // V0.2.6 邀请裂变：新用户经分享卡片带 inviterCode 进入（path query），暂存待 onboarding 绑定
    const inviterCode = options?.query?.inviterCode as string | undefined;
    if (inviterCode) this.globalData.pendingInviter = inviterCode;

    // 3. 静默登录（恢复 cached token + 拉 user/config；首次启动无 token 则等业务页 ensureLogin 兜底）
    //    V0.1.39：恢复真登录（删 hardcoded 张晨，GAP-5 关闭）
    silentLogin()
      .then(async () => {
        // V0.2.6 登录后预加载我的邀请码（onShareAppMessage 同步 return，不能 await，故提前缓存）
        try {
          const { inviteCode } = await api.call<{ inviteCode: string }>('distribution', 'inviteInfo');
          this.globalData.inviteCode = inviteCode ?? '';
        } catch {
          // 未登录或接口异常：分享不带码降级，不阻塞
        }
      })
      .catch(() => {});
  },
});
