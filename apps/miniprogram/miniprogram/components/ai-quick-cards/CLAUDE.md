# components/ai-quick-cards — 健康助手 5 色分类卡

> 📍 面包屑：`QM-WX/` → [根 CLAUDE.md](../../../../CLAUDE.md) → [apps/miniprogram/CLAUDE.md](../../CLAUDE.md) → **components/ai-quick-cards/**（这里）
> 引入版本：**V0.2.9**（prototype 借鉴）

---

## 🎯 组件职责

**健康助手页 5 张分类轻交互卡**：替代原 QUICK_QUESTIONS 横滚胶囊，5 张 5 色卡片（膳食/科学/商业/思维/分享）。

- 复用点：健康助手页（pages/ai-coach）首次进入无历史时显示
- 设计目标：每张卡「场景化引导」（不限单一话题）+ 视觉强调（5 色差异化）

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `cards` | `Array<{tag, q, icon, color}>` | `DEFAULT_CARDS` | 5 张卡配置（绿/紫/黄/白/橙） |

### 默认 5 卡

| 标签 | emoji | 问题 | 色 |
| --- | --- | --- | --- |
| 膳食 | 🥗 | 我今天该吃什么？ | 绿 #22ad78→#0c6b45 |
| 科学 | 🔬 | 用科学角度分析我的训练 | 紫 #5d6cd8→#8a5cf0 |
| 商业 | 🛒 | 跑步相关的商业装备推荐 | 黄 #fdecc0→#fbd677 |
| 思维 | 💡 | 怎么保持跑步动力？ | 白 #f5f6f5 |
| 分享 | 🎙️ | 帮我写一段跑步感悟文案 | 橙 #ffb888→#e8830c |

---

## 📡 事件

```ts
this.triggerEvent('tap', { q: string, tag: string });
```

父级 `pages/ai-coach` 的 `onQuickCardTap` 接到后将 `q` 写入输入框触发 `onSend()`。

---

## 🎨 视觉

- 5 列等分网格（grid-template-columns: repeat(5, 1fr)）
- 每卡上下：icon 大 + tag 小 + q 2 行
- active 状态 scale(0.96) 触感反馈
- 渐变色按 prototype 借色（accent 不动主色 #2D9D78）

---

## 📁 文件结构

```
components/ai-quick-cards/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, methods }) + DEFAULT_CARDS 常量
├── index.json          # { component: true }
├── index.wxml          # 5 列 grid + 卡片
└── index.wxss          # 5 套渐变色 + scale active
```

---

## ⚠️ 关键范式与坑

1. **CustomEvent 类型断言**：`e.detail.q`（不是 `e.currentTarget.dataset.q`，因为这是 triggerEvent 派发非 dataset）
2. **fallback 保留**：原 QUICK_QUESTIONS 横滚胶囊已 **删除**（V0.2.5 纠 V0.2.4 网格错 时加回来，V0.2.9 整体替换为新组件）；如未来需要在「5 卡 + 横滚胶囊」双选，可保持 DEFAULT_CARDS 与 QUICK_QUESTIONS 数据并列
3. **配色独立**：5 色全为 prototype 借色，**不动主品牌色 #2D9D78**（保留 YAGNI 决策）

---

## 📝 变更记录 (Changelog)

- **2026-07-16** — V0.2.9 创建：prototype 借鉴 5 张分类轻交互卡，取代 V0.2.5 沿用的 QUICK_QUESTIONS 横滚胶囊
