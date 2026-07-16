# components/invite-bonus-card — 3 列邀请奖励卡

> 📍 面包屑：`QM-WX/` → [根 CLAUDE.md](../../../../CLAUDE.md) → [apps/miniprogram/CLAUDE.md](../../CLAUDE.md) → **components/invite-bonus-card/**（这里）
> 引入版本：**V0.2.9**（prototype 借鉴）

---

## 🎯 组件职责

**3 列邀请奖励卡**：我的页用户卡下、紫色等级卡上方，黄底暖色背景显示「邀请好友，双方得奖励」3 列简短摘要。

- 复用点：我的页（V0.2.9 prototype 唯一复用页）
- 设计目标：在 mine 页提示用户有邀请奖励（不打开 membership 页也能感知）
- 与 membership 页详细版共存：membership 页 V0.2.6 已有完整版（含邀请码 + 兑换套餐 + 权益列表）

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `inviterDays` | `number` | `7` | 邀请人会员天数（小程序给邀请人的奖励） |
| `inviterPoints` | `number` | `50` | 邀请人积分（小程序给邀请人的奖励） |
| `inviteeDays` | `number` | `3` | 好友体验天数（小程序给被邀请人的奖励） |

> 三数字皆硬编码（设计决策：运营简化，未来如要调整由运营改 V0.2.6 AppConfig）

---

## 📡 事件

```ts
this.triggerEvent('tap');  // 点击跳转 membership 页
```

父级 `pages/mine` 的 `onTapInviteBonus` 接到后 `wx.navigateTo('/pages/membership/index')`。

---

## 🎨 视觉

- 黄渐变背景 `#fff8e1 → #fdecc0`（prototype 借色）
- 3 列等分布局：每列白色半透明底 + emoji 数字 + 标签
- 数字色：+7 天 绿 #0e7a52 / +50 橙 #e8830c / +3 天 深橙 #d2691e
- 底部「立即邀请 ›」链接

---

## 📁 文件结构

```
components/invite-bonus-card/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, methods })
├── index.json          # { component: true }
├── index.wxml          # 3 列 grid + 标题 + 链接
└── index.wxss          # 黄渐变 + 3 色数字
```

---

## ⚠️ 关键范式与坑

1. **与 membership 页共存**：mine 页只显示摘要，详细奖励规则 + 邀请码 + 兑换在 membership 页（V0.2.6）
2. **`inviterDays/Points/inviteeDays` 硬编码**：不变运营快速调整（YAGNI，不引 AppConfig 新字段）
3. **`prefix` vs `suffix`**：uni 字段属性保持与后端 distribution.inviteInfo 字段命名一致（`inviterDays`/`inviteeDays`），方便日后从接口拉

---

## 📝 变更记录 (Changelog)

- **2026-07-16** — V0.2.9 创建：prototype 借鉴，mine 页首次可见邀请奖励摘要，点击跳 membership 页
