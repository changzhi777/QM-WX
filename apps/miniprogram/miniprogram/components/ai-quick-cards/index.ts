// components/ai-quick-cards — 健康助手 5 色分类卡（V0.2.9 prototype 借鉴）
// 替代原 QUICK_QUESTIONS 横滚胶囊：5 张分类卡（膳食/科学/商业/思维/分享 5 色：绿/紫/黄/白/橙）
// 每张卡显示 emoji icon + 引导语，点击触发 onTap 事件（父级把 q + tag 注入到 ai-coach 输入框）
type ColorKey = 'green' | 'purple' | 'yellow' | 'white' | 'orange';
interface Card {
  tag: string;
  q: string;
  icon: string;
  color: ColorKey;
}

const DEFAULT_CARDS: Card[] = [
  { tag: '膳食',   q: '我今天该吃什么？',         icon: '🥗', color: 'green' },
  { tag: '科学',   q: '用科学角度分析我的训练', icon: '🔬', color: 'purple' },
  { tag: '商业',   q: '跑步相关的商业装备推荐', icon: '🛒', color: 'yellow' },
  { tag: '思维',   q: '怎么保持跑步动力？',     icon: '💡', color: 'white' },
  { tag: '分享',   q: '帮我写一段跑步感悟文案', icon: '🎙️', color: 'orange' },
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
