# Changelog

> QM-WX 青沐生命科技微信小程序 + Node 后端
> 参考任务：**CT400**（V1.0 初始化 + V2 骨架 + 部署准备）
> 时间：2026-06-11

---

## CT400 · V1.0 初始化（已落）

- ✅ monorepo 骨架：pnpm workspaces + 共享 TS / ESLint / Prettier
- ✅ 后端 9 个 module 30+ action：
  - user（登录 / 资料 / me）
  - sport（打卡 + 群 + 榜单 + 周报 + 防作弊）
  - mall（商品 / 订单 + 积分双态）
  - content（赛事 / 酒店 / 景区 / 餐饮 / 乡村振兴 五合一）
  - wallet（feature-gated 守门）
  - admin（白名单 + upsert）
  - auth（refresh token 轮换）
  - upload（multipart + 本地存储）
  - weekly-report（聚合 + canvas 战报图）
- ✅ 小程序 13 页面 + 3 组件（feature-gate / profile-popup / privacy-popup）
- ✅ Prisma + PostgreSQL（13 张表 + seed 初始化 AppConfig）
- ✅ JWT 鉴权 + 微信 code2Session
- ✅ 隐私协议首启弹窗
- ✅ docker-compose / GitHub Actions CI / smoke test
- ✅ 10 个单测
- ✅ 4 份权威文档：ARCHITECTURE-V2 / PHASE-0-PLAN / PHASE-V2-PLAN / SUBMIT-CHECKLIST

## CT400 · V2 骨架（已落 stub，等外部依赖）

- ✅ 3 个新 module stub：device（Phase 6）/ recipe（Phase 7）/ ludong（Phase 7+）
- ✅ 8 张新 Prisma 表
- ✅ V2 计划文档（~30 天工作量 + 优先级 + 风险）

## CT400 · 待办（4 个未答问题）

1. 微信 AppID `wx426885831a05f18e` 验证（生产/测试？）
2. 部署云厂商（阿里云 / 腾讯云 / 华为云）
3. CI 微调（GitHub Actions vs 别的）
4. V2 优先级（设备方向 / 饮食方向 / 律动节奏 / 哪个 P0 先干）

## CT400 · 外部依赖（等批/等对接）

- 微信商户号（JSAPI 支付）—— V1.1 钱包/支付用
- 微信订阅消息模板（"运动周报"）—— V1 周报推送用
- 食品类目资质 —— V1 商城审核用
- 域名 ICP 备案 + SSL —— 部署前置
- 华为 Health Kit 企业认证（1-3d）—— V2 设备
- 佳明 Connect Developer Program（1-2 周）—— V2 设备
- 小米开放平台（2-4d + 3-5d）—— V2 设备
- 律动后端契约对齐 —— V2 律动对接
