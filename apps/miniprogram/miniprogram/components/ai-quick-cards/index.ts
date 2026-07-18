// components/ai-quick-cards — 健康助手分类卡（V0.2.9 prototype 借鉴 / V0.2.30 对齐原型 4 卡 2×2）
// 4 张分类卡 2×2 网格（恢复/损伤/睡眠/饮食），每卡 icon + 问题 + 副标题
// 点击触发 onTap 事件（父级把 q 注入到 ai-coach 输入框发送）
type ColorKey = 'green' | 'purple' | 'yellow' | 'orange';
interface Card {
  tag: string;
  q: string;
  sub: string;
  icon: string;
  color: ColorKey;
}

const DEFAULT_CARDS: Card[] = [
  { tag: '恢复', q: '今天该怎么练？',       sub: '基于你的恢复状态', icon: '🏃', color: 'green' },
  { tag: '损伤', q: '跑步膝盖疼怎么办？',   sub: '运动损伤评估',     icon: '💪', color: 'orange' },
  { tag: '睡眠', q: '最近睡不好怎么调？',   sub: '睡眠优化建议',     icon: '😴', color: 'purple' },
  { tag: '饮食', q: '减脂期吃什么？',       sub: '饮食营养指导',     icon: '🍱', color: 'yellow' },
];

Component({
  properties: {
    cards: { type: Array, value: DEFAULT_CARDS },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const { q, tag } = (e.currentTarget.dataset as { q?: string; tag?: string });
      this.triggerEvent('tap', { q, tag });
    },
  },
});
