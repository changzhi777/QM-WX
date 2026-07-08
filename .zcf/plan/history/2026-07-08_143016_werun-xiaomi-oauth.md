# 微信运动扩展 + 小米 OAuth 框架（V0.1.43，方案 3）

> syncWeRun stub → 实现入库 + myWeRun 查询；小米 OAuth 框架 stub 等 dev.mi.com 注册

## 范围
- 新表 WeRunRecord（userId+date unique）+ 迁移
- syncWeRun 实现（upsert 入库，同一日取 max step）
- +myWeRun 查询（Cache 60s）
- 前端 device-bind 加微信运动同步按钮 + 步数历史卡
- 小米 OAuth 框架 stub（等 dev.mi.com client_id/secret）
- 测试 +4

## 步骤
1. Prisma schema WeRunRecord + 迁移 `20260708090000_werun_record`
2. device.service syncWeRun 实现（stepList timestamp→date CN 时区 + upsert）
3. device.service +myWeRun（Cache 60s）
4. device.schema MyWeRunQuerySchema + device.routes +case
5. shared endpoints device +myWeRun
6. 前端 device-bind 微信运动同步 + 步数卡
7. 小米 OAuth stub（startOAuth vendor=xiaomi 已有，等注册）
8. 测试 +4
9. 验证

## 关键决策
1. WeRunRecord 独立表（步数 vs 距离语义不同，KISS）
2. syncWeRun upsert by userId+date（同一日取 max step 防回退）
3. 小米 OAuth 框架 stub（等 dev.mi.com 注册）

## 预期数字
- 表 45→46 / device action +1 myWeRun / 页 38 不变 / 测试 577→~581 / 迁移 19→20
