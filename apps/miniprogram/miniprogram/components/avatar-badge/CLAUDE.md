# components/avatar-badge — 头像双标识组件

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../CLAUDE.md) → [`apps/miniprogram/CLAUDE.md`](../../CLAUDE.md) → **components/avatar-badge/**（这里）
>
> 父级：[apps/miniprogram/CLAUDE.md](../../CLAUDE.md)
> 引入版本：**V0.2.7**（邀请裂变增长体系）

---

## 🎯 组件职责

**用户头像右上角双标识**：付费会员皇冠 + 成长等级徽章（diamond/gold/silver/bronze）。

- **复用点**：① mine 页用户卡头像（MVP 主要场景），② 动态 feed 用户头像（看到别人的等级），③ 评论/回复/通知列表头（看到对方身份）
- **设计目标**：一眼区分"付费用户 + 成长等级"，刺激攀比 + 强化成长激励

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `memberLevel` | `'free' \| 'monthly' \| 'quarterly' \| 'yearly'` | `'free'` | 付费会员等级（free=皇冠隐藏，其他等级均显示） |
| `growthLevel` | `'free' \| 'bronze' \| 'silver' \| 'gold' \| 'diamond'` | `'free'` | 成长等级（按累计积分 totalPointsEarned 自动算：100/500/2000/5000） |

> 成长等级门槛与后端 `deriveGrowthLevel(totalPointsEarned)` 一致，前端 `computeGrowth` 函数复用展示。

---

## 🔄 Observers

```ts
observers: {
  'memberLevel, growthLevel'(memberLevel, growthLevel) {
    const map = {
      diamond: { icon: '💎', cls: 'lv-diamond' },
      gold:    { icon: '🥇', cls: 'lv-gold' },
      silver:  { icon: '🥈', cls: 'lv-silver' },
      bronze:  { icon: '🥉', cls: 'lv-bronze' },
    };
    this.setData({
      isMember: memberLevel !== 'free',
      levelIcon: map[growthLevel]?.icon ?? '',
      levelClass: map[growthLevel]?.cls ?? '',
    });
  }
}
```

---

## 🎨 视觉规则

| 状态 | 渲染 |
| --- | --- |
| `memberLevel === 'free'` | 头像不显示皇冠 |
| `memberLevel ∈ {monthly, quarterly, yearly}` | 头像右上角显示金色 👑 皇冠 |
| `growthLevel === 'free'` | 不显示成长徽章 |
| `growthLevel === 'bronze'` | 🥉 + `lv-bronze` 灰白样式 |
| `growthLevel === 'silver'` | 🥈 + `lv-silver` 银色样式 |
| `growthLevel === 'gold'` | 🥇 + `lv-gold` 金色样式 |
| `growthLevel === 'diamond'` | 💎 + `lv-diamond` 钻石色样式（顶端用户独有） |

**位置**：皇冠固定在头像右上（-4px），成长徽章在皇冠下方或头像左下（按 wxml 布局）。

---

## 🔌 集成点

- **pages/mine**：`<avatar-badge memberLevel="{{user.memberLevel}}" growthLevel="{{growthLevel}}" />`
- **pages/feed**：feed-head avatar 旁叠加
- **pages/notification**：通知 actor 头像旁叠加（看通知者身份）

**后端依赖**：
- `user.me` 返回 `memberLevel`（前端调一次拿到 profile）
- `user.myPoints` 或 `points.summary` 返回 `totalPointsEarned`，前端 `computeGrowth` 算 `growthLevel`

---

## 📁 文件结构

```
components/avatar-badge/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, observers })
├── index.json          # { component: true }
├── index.wxml          # 头像 + 皇冠 + 徽章 三层布局
└── index.wxss          # lv-bronze/silver/gold/diamond 4 色 + crown 样式
```

---

## ⚠️ 关键范式与坑（沉淀）

1. **observers 双字段联动**：
   - 任一 prop 变化（付费状态变化/积分达到等级门槛）都触发重算
   - 前端在 `points.summary` 响应里同步刷新 `growthLevel` prop

2. **emoji 映射优先于自定义 SVG**：
   - KISS 原则：先用 emoji 表达等级（🥉🥈🥇💎），未来量大再换 SVG
   - 减少 wxss 自定义字符大小/对齐调整

3. **后端单一计算源**：
   - 前端 `computeGrowth` 只是展示用，**权限/奖励计算都用后端 `deriveGrowthLevel`**
   - 防止客户端绕过

---

## 📝 变更记录 (Changelog)

- **2026-07-16** — V0.2.7 创建：邀请裂变增长体系配套组件，mine 页 MVP 接入，复用点：feed / notification / 我的 / 关注列表
- **2026-07-16** — V0.2.6 pre：membership 页未建时先用占位 emoji，V0.2.7 头像双标识完整
