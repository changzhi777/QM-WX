# components/uv-alert — UV 强提示黄条

> 📍 面包屑：`QM-WX/` → [根 CLAUDE.md](../../../../CLAUDE.md) → [apps/miniprogram/CLAUDE.md](../../CLAUDE.md) → **components/uv-alert/**（这里）
> 引入版本：**V0.2.9**（prototype 借鉴）

---

## 🎯 组件职责

**UV 强提示黄条**：今日页顶部头部下方插入一条黄色背景（#fdecc0）的 UV 提示，含 UV 指数 / 等级 / 户外活动建议 + 关闭按钮。

- 复用点：今日页（V0.2.9 prototype 唯一复用页）
- 设计目标：凸显当日户外活动风险，强化「青沐绿生活」品牌关怀

---

## 📐 Props 接口

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `uv` | `number` | `0` | UV 指数（来自 stats.weatherAir，0=弱） |
| `show` | `boolean` | `true` | 受控显示开关（父级控制，本组件只发 close 事件） |

---

## ⚙️ observers 自动分级

`observers.uv(uv)` 内按紫外线指数分级：

| 段 | 等级 | icon | 文案 |
| --- | --- | --- | --- |
| `< 3` | low 较弱 | ☀️ | 户外可放心 |
| `3-5` | mid 中等 | 🌤️ | 戴帽/SPF 防晒 |
| `6-7` | high 较强 | 🌞 | SPF 30+ / 墨镜 / 宽檐帽 |
| `8-10` | extreme 很强 | 🌡️ | 避免 10-16 时段 / SPF 50+ |
| `≥ 11` | extreme 极强 | 🔥 | 不外出 / 物理遮挡 |

---

## 🎨 视觉

- 背景：黄渐变 `#fdecc0`（prototype 借色）
- 标题色 `#8a5a06` 棕黄 / 紫 `#6b3fa0` 副文案（accent 不动主色 #2D9D78）
- UV 等级色：low 绿 / mid 橙 / high 深橙 / extreme 红
- 关闭按钮：右上 `×` 大字 36rpx

---

## 📡 数据来源

- 后端：`stats.weatherAir` 接口（V0.1.148 已建）返 `{ uv, ... }`
- 失败静默：父级 `Promise.all(...).catch(() => null)`，UV 拿不到时 `uv: 0`，组件 `wx:if="{{uv && uvShow}}"` 自隐藏

---

## 📁 文件结构

```
components/uv-alert/
├── CLAUDE.md           # 本文件
├── index.ts            # Component({ properties, observers, methods })
├── index.json          # { component: true }
├── index.wxml          # 黄条 + icon + title + advice + close
└── index.wxss          # 黄底样式 + 4 色等级色
```

---

## ⚠️ 关键范式与坑

1. **失败静默 + 自隐藏**：父级 Promise.all 拉 `weatherAir`，失败 catch 不阻塞首页；组件本身 `wx:if="{{uv && uvShow}}"` 双保险
2. **`hour` `weather` 双保留**：当前未用，预留做「10-16 时段 + 户外活动」综合文案，避免一刀切
3. **关闭后不持久化**：sessionStorage 不写盘，刷新页面后再显示（避免永久 ban 用户看风险提示）

---

## 📝 变更记录 (Changelog)

- **2026-07-16** — V0.2.9 创建：prototype 借鉴，今日页 UV 强提示黄条首次落地
