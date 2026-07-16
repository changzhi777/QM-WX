# components/level-card — 紫色等级卡

> 📍 面包屑：`QM-WX/` → [根 CLAUDE.md](../../../../CLAUDE.md) → [apps/miniprogram/CLAUDE.md](../../CLAUDE.md) → **components/level-card/**（这里）
> 引入版本：**V0.2.9**（prototype 借鉴）

---

## 🎯 组件职责

**紫色等级卡**：我的页 data-strip 上方，紫渐变背景，显示当前 growthLevel emoji + 「累计积分」+ 进度条 + 「距下一级 X 积分」。

- 复用点：我的页（V0.2.9 prototype 唯一复用页）
- 与 avatar-badge 组件同源：复用 growthLevel 映射（free/bronze/silver/gold/diamond）
- 与前端 `computeGrowth` + 后端 `deriveGrowthLevel` 双源门槛一致（V0.2.7 沉淀）

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `growthLevel` | `'free'\|'bronze'\|'silver'\|'gold'\|'diamond'` | `'free'` | 成长等级 |
| `totalPointsEarned` | `number` | `0` | 累计积分（来自 User.totalPointsEarned V0.2.7） |
| `nickname` | `string` | `'跑者'` | 用户昵称（顶部显示） |

---

## ⚙️ observers 自动计算

`observers.growthLevel, totalPointsEarned(g, total)` 内：

| 当前等级 | 累计门槛 | 下一级 | emoji | 标签 |
| --- | --- | --- | --- | --- |
| free | 0 | bronze | 🌱 | 入门 |
| bronze | 100 | silver | 🥉 | 青铜学员 |
| silver | 500 | gold | 🥈 | 白银学员 |
| gold | 2000 | diamond | 🥇 | 黄金学员 |
| diamond | 5000 | — | 💎 | 钻石学员（MAX） |

进度条按段内插：(total - curThreshold) / (nextThreshold - curThreshold) × 100%

---

## 🎨 视觉

- 紫渐变 `#8a5cf0 → #5d6cd8`
- 进度条：黄橙渐变 `#ffd54f → #ff8a80`（accent 不动主色 #2D9D78）
- 距下一级提示：黄字高亮积分
- 「MAX」标签：右上角钻石用户独有
- `max-tip` 用户达 diamond 级：「已达成最高等级，继续保持 ✨」

---

## 📁 文件结构

```
components/level-card/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, observers })
├── index.json          # { component: true }
├── index.wxml          # 头 + 进度条 + 提示
└── index.wxss          # 紫渐变 + 黄橙进度条
```

---

## ⚠️ 关键范式与坑

1. **双源门槛一致**：门槛 100/500/2000/5000 与 frontend `computeGrowth()` + backend `deriveGrowthLevel()` 同源（V0.2.7 init #7 沉淀）
2. **MAX 状态显式区分**：`nextLevel === ''` 时显示 `progress-text 替换为 max-tip`，不画空进度条
3. **`type:null` 不必要**：本组件 4 个属性都是字符串或数字，无联合类型，无需 type:null 范式（区别 V0.2.4 data-strip）

---

## 📝 变更记录 (Changelog)

- **2026-07-16** — V0.2.9 创建：prototype 借鉴紫色等级卡。我的页首次可见 growthLevel + 累计积分 + 进度条
