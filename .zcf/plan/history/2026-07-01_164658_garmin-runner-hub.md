# 佳明跑者中心（garmin-runner-hub）

> 📍 `/zcf:workflow` 任务 | 创建 2026-07-01 | 模式：执行

## 上下文
参考必迈天天跑 + 华为运动健康 + 轻讯跑团 3 个跑者生态小程序（pic/ 14 张截图），扩展青沐小程序为「跑者数据中心」。本期聚焦 3 页（D），功能完整（乙），统一榜（①），全量导入（甲）。

## 5 项关键决策
1. **范围（Q1=D）**：我的（跑者版）+ 佳明数据处理 + 榜单
2. **深度（Q2=乙）**：功能完整（后端表/接口/测试）
3. **榜单（Q3=①）**：统一榜 — 佳明导入 Checkin，与手动打卡同榜
4. **现有数据（Q4=甲）**：15723 条全量导入（dataSource=garmin）
5. **架构（方案 2）**：新建 stats + ranking 模块 + BullMQ 异步导入
6. **物理设计（2b）**：RawActivity 加 status 字段（非独立表，省双写）

## 执行阶段

### 阶段 0：数据层
- 0.1 RawActivity 加 status(pending/imported/ignored) + importedAt + importedCheckinId + vendorActivityId 唯一索引
- 0.2 Checkin 加 dataSource(manual/garmin) + garminActivityId(nullable unique) + sportType(run/hike/ride/other)
- 0.3 迁移 2026070x_garmin_import_ranking：回填 RawActivity.status='pending'，Checkin.dataSource='manual'
- 0.4 scripts/import-garmin.ts：筛选 distance>0 && duration>0，按 vendorActivityId 去重，500/事务批量写 Checkin + 更新 RawActivity.status='imported'

### 阶段 1：后端新模块
- 1.1 stats 模块：myRunnerStats(userId, year/month) 聚合跑量/打卡/配速 + Cache.wrap
- 1.2 ranking 模块：groupRankingMulti(groupId, sportType, period) 多维榜单（跑步/健步/等级）
- 1.3 device 扩展：myPending / myProcessed / ignoreActivity / importToCheckin（入队）
- 1.4 sport.groupRanking 委托 ranking 模块（兼容旧客户端）

### 阶段 2：BullMQ 异步导入
- 2.1 garmin-import 队列 + worker：去重校验 → 写 Checkin → 更新 RawActivity.status
- 2.2 device.importToCheckin 入队返 taskId
- 2.3 scheduler 注册（可选定时同步）

### 阶段 3：共享层 + 前端
- 3.1 ENDPOINTS 加 stats + ranking + device 4 action
- 3.2 改 mine 页：跑量汇总卡 + 服务九宫格（参考 2768）
- 3.3 新建 garmin-data 页：待处理/已处理 + 爬升补偿 + 导入/忽略（参考 2769）
- 3.4 新建 ranking 页：跑步榜/等级榜/健步榜 + 跑团子榜（参考 2772）
- 3.5 app.json 注册路由

### 阶段 4：测试
- 4.1 stats/ranking/device 单元测试
- 4.2 garmin-import.job 测试
- 4.3 e2e garmin-import-flow

### 阶段 5：文档
- 5.1 14→16 module + 表数 + device 升级声明（CLAUDE.md × 2 + index.json）

## 风险
- 全量导入多类型 → 0.4 只导入 sportType ∈ {run, hike}（骑行 separateTag 不进跑榜）
- Checkin.garminActivityId nullable unique（Postgres 支持）
- BullMQ worker mock 参考 close-order.job.test.ts

## 工作量 ≈ 4 人天
