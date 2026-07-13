// components/feature-gate/index.ts
// 用法：<feature-gate flag="wallet" flags="{{flags}}"><view>钱包入口</view></feature-gate>
//
// V0.1.140 修时序 bug：原 attached 读 globalData.config（silentLogin 异步未完时 null → visible=false 不重渲染）
// 改：加 flags prop + observer（父页 flags 变化 → 响应式更新 visible）；flags 空则兜底 globalData
import type { FeatureFlag } from '@qm-wx/shared';

Component({
  options: { multipleSlots: true },
  properties: {
    flag: { type: String, value: '' },
    // V0.1.140：父页传入 flags（响应式，mine data.flags 变化触发 observer）
    flags: { type: Object, value: {} },
  },
  data: {
    visible: false,
  },
  observers: {
    // flags 变化（父页 refresh 设）→ 更新 visible（空对象跳过，兜底 attached 的 globalData）
    flags(flags: Record<string, boolean>) {
      if (Object.keys(flags).length > 0) {
        this.setData({ visible: !!flags[this.data.flag as FeatureFlag] });
      }
    },
  },
  lifetimes: {
    attached() {
      const flags = this.data.flags as Record<string, boolean>;
      if (Object.keys(flags).length > 0) {
        // 父页已传 flags → 用
        this.setData({ visible: !!flags[this.data.flag as FeatureFlag] });
      } else {
        // 兜底：globalData（兼容老用法，非响应式）
        const gf = (getApp().globalData.config?.featureFlags ?? {}) as Record<string, boolean>;
        this.setData({ visible: !!gf[this.data.flag as FeatureFlag] });
      }
    },
  },
});
