// 计划卡组件（V0.1.139）— 渲染 AI 生成的结构化周计划 + 采纳/重新生成/对话微调
// level/type 英文 key → 中文 label 映射（wxss selector 禁用中文，V0.1.32 范式）

const LEVEL_LABELS: Record<string, string> = {
  beginner: '入门',
  intermediate: '进阶',
  challenge: '挑战',
  extreme: '极限',
};

const TYPE_LABELS: Record<string, string> = {
  easy: '轻松',
  interval: '间歇',
  long: '长距',
  rest: '休息',
  tempo: '节奏',
  cross: '交叉',
};

Component({
  properties: {
    plan: { type: Object, value: {} },
  },
  data: {
    levelLabel: '',
    typeLabel: TYPE_LABELS,
  },
  observers: {
    plan(p: { level?: string } | null) {
      if (!p) return;
      this.setData({ levelLabel: LEVEL_LABELS[p.level || ''] || p.level || '' });
    },
  },
  methods: {
    onAdopt() {
      this.triggerEvent('adopt', { plan: this.data.plan });
    },
    onRegenerate() {
      this.triggerEvent('regenerate');
    },
    onTweak() {
      this.triggerEvent('tweak', { plan: this.data.plan });
    },
  },
});
