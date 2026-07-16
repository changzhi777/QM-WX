# pages/report-detail — AI 健康报告详情页

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../../CLAUDE.md) → [`apps/miniprogram/CLAUDE.md`](../../CLAUDE.md) → **pages/report-detail/**（这里）
> 引入版本：**V0.2.4**（健康中心三页 UI 改版）
> 当前进度：**V0.2.13 K2 visual verified ✅**

---

## 🎯 页面职责

**AI 健康报告详情页** — 从「今日」页卡 `查看完整报告` 跳入；展示当天 AI 解读的完整内容 + 健康分数 + 趋势对比 + 营养/运动建议全文。

**关键设计**：
- **会员/免费双轨**：免费用户每周 1 次全文（`user.checkReportQuota` 配额），超出后 `reportText` 仅展示前 60 字 + 🔒 锁定 + 升级会员按钮
- **历史日模式**：接 `?date=2026-07-15` 查询参数，从 `dailyReportList` 找匹配 date 的报告（init #14 优化项）
- **Share**：右上分享 → 分享朋友 + 触发 `points.awardShare` 积分

---

## 📐 路由与数据

**路由**：
- 今日页：`bindtap="goReportDetail"` → `/pages/report-detail/index`（今日模式）
- 今日页历史项：`bindtap="onTapHistory"` + `data-date="{{date}}"` → `/pages/report-detail/index?date={{date}}`（历史模式）

**入参（query）**：
```ts
{ date?: string }  // V0.1.144 init #14 加的 ②历史报告点击
```

**接口**：
- `stats.dailyReport` — 当日报告详情（reportText / healthScore / alertText / steps / restingHr / sleepHours）
- `stats.healthScore` — 当日健康分数 + 趋势（yesterday / diff）
- `user.checkReportQuota`（V0.2.6） — 返 `{ canView: boolean, weeklyUsed: number, quota: number }`
- `stats.dailyReportList` — 历史模式页大小 30，按 date 过滤

**后端**：`apps/server/src/modules/stats/stats.service.ts` + `user.service.ts` (V0.2.6 quota)

---

## 🔄 State 管理

```ts
{
  loading: boolean,
  report: DailyReport | null,
  score: HealthScoreRes | null,
  isMember: boolean,           // 是否付费会员
  previewText: string,         // 免费用户可见 N 字 / 会员可见全文
  locked: boolean,              // reportText 是否锁定
}
```

**初始化**：
1. `ensureLogin()` → 拿 user（含 memberLevel）
2. `api.call('user', 'checkReportQuota')` → canView
3. 根据 `query.date` 二选一：
   - 有 date → 调 dailyReportList + 找匹配
   - 无 date → 调 dailyReport + healthScore 并行
4. 配额 canView → `locked: false` + `previewText: text`；否则 `locked: true` + `previewText: text.slice(0, 60)`

---

## ⚠️ 关键范式与坑

### 1. 免费用户模糊锁定 + 升级引导
- 60 字预览 + 锁定标记 + 升级会员按钮 → goMembership() 跳 /pages/membership/
- V0.2.6 quota 接口：`user.checkReportQuota` 返 `canView` 决定解锁

### 2. 历史日模式（init #14 加）
- 接 `?date` query 参数
- 调 `dailyReportList pageSize:30` 拉 30 天列表 find(date)
- score 用 report 转 HealthScoreRes 接口（trend 缺失 fallback 0）
- 历史日不显示 trend 比较（避免歧义）

### 3. Share 集成 points.awardShare
- `onShareAppMessage` 返 `path` 包含 `inviterCode` query（邀请人追踪）
- success 回调调 `api.call('points', 'awardShare')`（失败 catch 不阻塞）

### 4. 与今日页协同
- 今日页 `reportSummary = summarizeReport(text).slice(0, 2 句)` — 仅显示 AI 摘要（2 句话）
- 详情页显示完整 reportText — 文案可能很长
- 两者都用同一 DailyReport 缓存（30s TTL via stats 接口）

---

## 🔗 集成点

- **pages/index**（今日） — 「查看完整报告」+「问 AI 深聊」入口
- **pages/index**（今日历史） — `onTapHistory(data-date)` 跳详情 ?date=
- **pages/membership** — `locked=true` 时跳升级页
- **apps/server/src/modules/stats** — dailyReport / dailyReportList / healthScore action
- **apps/server/src/modules/user** — V0.2.6 checkReportQuota action

---

## 📁 文件结构

```
pages/report-detail/
├── CLAUDE.md     # 本文件
├── index.json    # { navigationBarTitleText: "健康报告" }
├── index.ts      # Page({ onLoad, goMembership, onShareAppMessage }) — 91 行
├── index.wxml    # 完整报告详情布局 — 卡 + 趋势 + 全文
└── index.wxss    # 模糊锁定样式 + 升级引导
```

---

## 📝 变更记录 (Changelog)

- **2026-07-15** — V0.2.4 创建：健康中心三页 UI 改版抽详情页（含 FREE_PREVIEW_LEN 60 字 + 升级会员入口）
- **2026-07-15** — V0.2.5 拓展：`?date=` 历史日路径（init #14 加）
- **2026-07-15** — V0.2.7 加：V0.2.6 quota（会员周限制）复用 `user.checkReportQuota` → `locked` / `previewText` 切换
- **2026-07-16** — V0.2.13 K2 视觉验证：`docs/V0.2.13-vision-verify.md` 记录本页面在 init #12 base line 截图覆盖（`pages_report-detail_index.png` 306KB）
- **2026-07-16** — V0.2.15 B3 补：本 CLAUDE.md 文档（init #14 GAP-13 关闭时漏了页面级 CLAUDE.md）
