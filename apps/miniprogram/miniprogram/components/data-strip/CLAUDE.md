# components/data-strip — 健康数据概览条

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../CLAUDE.md) → [`apps/miniprogram/CLAUDE.md`](../../CLAUDE.md) → **components/data-strip/**（这里）
>
> 父级：[apps/miniprogram/CLAUDE.md](../../CLAUDE.md)
> 引入版本：**V0.2.4**（健康中心三页 UI 改版抽组件 DRY）

---

## 🎯 组件职责

**4 项健康数据概览条**（步数/静息心率/昨晚睡眠/健康分），用于取代散落在多页的内联 today-data-strip，实现 DRY。

- **复用点**：① 健康助手页头部（`pages/ai-coach` 渐变绿顶），② 我的页（`pages/mine` 用户卡下方），③ 报告详情页（`pages/report-detail`）
- **设计目标**：一个组件贯穿 3 个页面，统一视觉风格 + 减少维护成本

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `steps` | `number \| null` | `0` | 今日步数（来自 stats.healthScore 同源） |
| `restingHr` | `number \| null` | `null` | 静息心率 bpm（来自 health-record） |
| `sleepHours` | `number \| null` | `null` | 昨晚睡眠小时数（精度 0.1） |
| `healthScore` | `number \| null` | `0` | 健康分 0-100（来自 stats.healthScore，AI 私教 / 健康助手同源） |
| `mode` | `'light' \| 'dark'` | `'light'` | 主题：light=白底深字（mine/report-detail）/ dark=半透明白底白字（ai-coach 渐变绿头） |

> ⚠️ **关键坑 — `type: null` 绕微信 properties Number+null 类型冲突**：
>
> 微信小程序 properties 不接受 `Number` + `null` 联合类型（编译报错）。本组件用 **`type: null`**（俗称 `null type`）让 TS 编译为 `number \| null`，**`observers` 内 `f(v: number \| null | undefined)` 三态判断**实现 '--' 占位：
> ```ts
> const f = (v: number | null | undefined, unit = '') => (v == null ? '--' : `${v}${unit}`);
> ```
> 此技巧沉淀为团队通用范式（V0.2.4 typecheck 教训）。

---

## 🔄 Observers

```ts
observers: {
  'steps, restingHr, sleepHours, healthScore'(
    steps, restingHr, sleepHours, healthScore,
  ) {
    // 4 项 props 任一变更都重新计算 items 数组
    // setData({ items: [{icon, value, label}, ...] })
  }
}
```

WXML 用 `wx:for="{{items}}"` 渲染 4 格，每格固定图标 + 动态 value + label：

| icon | 中文 label | 数据源 |
| --- | --- | --- |
| 👟 | 今日步数 | `steps` |
| ❤️ | 静息心率 | `restingHr` |
| 😴 | 昨晚睡眠 | `sleepHours` |
| 💯 | 健康分 | `healthScore` |

---

## 🎨 主题切换

- **light**（默认）：白底 + 深字（`#333`）+ 浅灰分割线 — 用于 `pages/mine` 用户卡、`pages/report-detail` 摘要
- **dark**：半透明白底 + 白字 — 用于 `pages/ai-coach` 渐变绿头部叠加层

`<data-strip mode="dark" steps="..." />` 直接覆盖默认主题。

---

## 📁 文件结构

```
components/data-strip/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, observers })
├── index.json          # { component: true }
├── index.wxml          # 4 格 grid + icon + value + label
└── index.wxss          # light + dark 两套样式
```

---

## ⚠️ 关键范式与坑（沉淀）

1. **`type: null` 范式**（V0.2.4 typecheck 教训）：
   - 微信 properties 不支持 `Number | null` 联合声明
   - 解决方案：`type: null` + observers 参数显式标 `number | null | undefined` + null 兜底渲染 '--'

2. **observers 联动范式**：
   - 4 个数值 props 任一变更都重算 `items` 数组
   - 用 `'a, b, c, d'(a, b, c, d){}` 多字段监听，新版微信 API 也支持 `wx:if` 嵌套

3. **DRY 价值**：
   - 前置：3 页（mine + ai-coach + report-detail）各写一份 today-data-strip 内联
   - 抽组件后：1 处源 + 3 处复用，改样式/数据源只动 1 个文件

---

## 📝 变更记录 (Changelog)

- **2026-07-15** — V0.2.4 创建：今日页（light 模式）/ 健康助手页（dark 模式替内联 today-data-strip）/ 我的页（light 模式替内联）/ 报告详情页（light 模式）— 共 4 页复用
- **2026-07-15** — V0.2.5 拓展：diet 加拍照识别，data-strip diet 页未复用（diet 关注餐食而非健康概览）
