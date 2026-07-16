// components/uv-alert — UV 强提示黄条
// V0.2.9 prototype 借鉴：今日页顶部，UV 指数提醒 + 户外活动建议
// 黄色背景 #fdecc0 + 关闭按钮 emit 'close'（父级记 sessionStorage）
Component({
  properties: {
    uv: { type: Number, value: 0 },
    show: { type: Boolean, value: true },
  },
  data: {
    level: 'low',           // low/mid/high/extreme
    levelText: '',
    icon: '☀️',
    advice: '',
  },
  observers: {
    'uv'(uv: number) {
      // UV 等级 + 户外建议
      let level = 'low';
      let levelText = '较弱';
      let icon = '☀️';
      let advice = '今天紫外线不强，可以放心户外活动。';
      if (uv >= 3 && uv < 6) {
        level = 'mid';
        levelText = '中等';
        icon = '🌤️';
        advice = '今天紫外线中等，户外活动可适当防晒，建议戴帽子/涂抹低 SPF 防晒霜。';
      } else if (uv >= 6 && uv < 8) {
        level = 'high';
        levelText = '较强';
        icon = '🌞';
        advice = '今天紫外线较强，户外活动建议涂 SPF 30+ 防晒霜，戴墨镜、宽檐帽。';
      } else if (uv >= 8 && uv < 11) {
        level = 'extreme';
        levelText = '很强';
        icon = '🌡️';
        advice = '今天紫外线很强，尽量避免 10:00-16:00 长时间户外活动，必须涂 SPF 50+ 防晒 + 物理遮挡。';
      } else if (uv >= 11) {
        level = 'extreme';
        levelText = '极强';
        icon = '🔥';
        advice = '今天紫外线极强，避免外出。必须穿长袖长裤 + 宽檐帽 + 太阳镜 + 高倍防晒。';
      }
      this.setData({ level, levelText, icon, advice });
    },
  },
  methods: {
    onClose() {
      this.setData({ show: false });
      this.triggerEvent('close');
    },
  },
});
