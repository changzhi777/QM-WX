// components/data-strip — 4 项健康数据概览条（步数/心率/睡眠/健康分）
// 复用：健康助手页头部 / 我的页（V0.2.4 健康中心改版抽组件 DRY）
// mode: light（白底深字，默认，用于白底卡片）/ dark（半透明白底白字，用于渐变绿头部）
Component({
  properties: {
    steps: { type: null, value: 0 },
    restingHr: { type: null, value: null },
    sleepHours: { type: null, value: null },
    healthScore: { type: null, value: 0 },
    mode: { type: String, value: 'light' },
  },
  data: {
    items: [] as Array<{ icon: string; value: string; label: string }>,
  },
  observers: {
    'steps, restingHr, sleepHours, healthScore'(
      steps: number | null,
      restingHr: number | null,
      sleepHours: number | null,
      healthScore: number | null,
    ) {
      const f = (v: number | null | undefined, unit = '') => (v == null ? '--' : `${v}${unit}`);
      this.setData({
        items: [
          { icon: '👟', value: f(steps), label: '今日步数' },
          { icon: '❤️', value: f(restingHr), label: '静息心率' },
          { icon: '😴', value: f(sleepHours, 'h'), label: '昨晚睡眠' },
          { icon: '💯', value: f(healthScore), label: '健康分' },
        ],
      });
    },
  },
});
