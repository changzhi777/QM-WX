# 分销中心 + 天天跑首页（V0.1.24，方案 1 全持久化）

> 起于 2026-07-03，`/zcf:workflow` B 剩余。方案 1（3 表 + 全闭环）。

## 上下文
- B 方向（电商+分销+积分）剩余：2762 分销中心 + 2767 天天跑首页
- 当前：20 module / 30 表 / 21 页 / 444 单元测试
- tabBar 已满 4（首页/运动/商城/我的），天天跑建独立页不动 tabBar

## 决策
- **方案 1**（用户选）：3 新表 + distribution module 6 action + createOrder/notify/refund 全集成
- 天天跑入口：mine + mall 顶部 banner

## 阶段计划

### 0 数据层（30→33 表）
- `DistributionOrder`(id/userId/orderId@unique/orderAmount/commissionRate/commissionAmount/status/settledAt) + `Team`(inviterId/inviteeId@unique/level) + `CommissionLog`(userId/orderId?/amount/type/balanceAfter)
- User +inviteCode@unique +distributorLevel(V0/V1/V2/V3)
- Order +sourceUserId
- 迁移 `20260702180000_distribution`
- 等级规则（常量）：V1≥100元或3人(10%) / V2≥500或10人(15%) / V3≥2000或50人(20%)，间推减半

### 1 distribution module（6 action）
- mySummary：本月佣金(CommissionLog) + 销售金额(DistrOrder) + 订单数 + 等级 + inviteCode
- myOrders / myTeam / myCommissionLogs / myLevel（升级进度）/ inviteInfo（邀请链接+说明静态）

### 2 集成（核心闭环）
- mall.createOrder：input +inviteCode → 解析 inviter → order.sourceUserId + DistrOrder(pending) + Team(若新)
- wxpay notify paid：order→paid 且 sourceUserId → settleCommission(DistrOrder→settled + CommissionLog + Wallet increment + WalletTransaction(commission) + inviter 等级重算)
- refund：order→refunded 且 sourceUserId → DistrOrder→cancelled + 已settled则冲红

### 3 前端 2 页 + 入口
- pages/distribution（2762）：红卡(3数据) + 6宫格 + inviteCode 复制
- pages/tiantian（2767）：搜索 + 3入口(天天跑/活动报名/立即打卡) + 促销横幅 + 功能模块 + 新人专享(mall tag=new)
- mine +分销中心/天天跑；mall 顶部 banner

### 4 seed + 测试 + 部署
- seed：张晨 inviteCode + Team + 3 样例 DistrOrder/CommissionLog
- 测试：distribution 6 单测 + createOrder inviteCode 集成 + settleCommission 集成
- shared ENDPOINTS + distribution；app.json 注册
- scp + migrate + 重建

## 风险
- 改 mall.service + wxpay.routes + refund.service 三处，保 444+ 全绿
- 用 Number()+toFixed 规避 decimal.js
- CommissionLog.balanceAfter 用 Wallet 余额快照
