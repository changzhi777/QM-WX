# 个人中心电商版（订单 5 tab + 地址 + 优惠券）

> 📍 `/zcf:workflow` | 2026-07-02 | 方案 1 / 2-A（Coupon MVP 领/看，createOrder 集成下期）

## 决策
- 订单 5 tab（全部/待付/待发/待收/已完成）+ status 过滤
- Address CRUD（setDefault 先清他）
- Coupon MVP：领券中心（模板常量）+ 我的券（unused/used/expired）+ receive 领取
- **不含** createOrder couponId 使用（下期）

## 阶段
- 0. Address + Coupon 表 + 迁移
- 1. address 模块 + coupon 模块 + mall.myOrders 扩 status
- 2. order-list 5 tab + address 页 + coupon 页 + mine 入口
- 3. 测试 + 文档（20 module / 30 表 / 21 页）

## 工作量 ~3.5 人天
