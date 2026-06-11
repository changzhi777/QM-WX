// components/feature-gate/index.ts
// 用法：<feature-gate flag="wallet"><view>钱包入口</view></feature-gate>

import type { FeatureFlag } from '@qm-wx/shared';

Component({
  options: { multipleSlots: true },
  properties: {
    /** 要检查的功能开关名 */
    flag: { type: String, value: '' },
  },
  data: {
    visible: false,
  },
  lifetimes: {
    attached() {
      const flags = (getApp().globalData.config?.featureFlags ?? {}) as Record<string, boolean>;
      const flag = (this.data.flag as FeatureFlag);
      this.setData({ visible: !!flags[flag] });
    },
  },
});
