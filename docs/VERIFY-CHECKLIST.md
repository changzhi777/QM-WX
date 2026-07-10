# 真机验证 + wxpay 商户配置清单（V0.1.121 节点）

> 📍 V0.1.119 生产部署 + V0.1.112~121 全栈就绪后的发布验证清单
> 配套：[PHASE-4-2-PREP.md](./PHASE-4-2-PREP.md)（切真生产 playbook）

## 当前状态（2026-07-10）

- **生产**：qingmulife.cn 运行 V0.1.119（qmwx-server healthy，32 迁移）
- **GitHub**：v0.1.112~121 全 push（10 tag）
- **小程序**：待上传微信开发者工具（V0.1.112~121 前端：评价闭环 + 赛事报名 + 用户 tab）
- **wxpay 商户**：申请中（阻塞赛事支付真集成）

---

## 一、wxpay 商户配置（赛事支付生效前提）

### 阻塞点
**商户号申请中**（微信支付商户平台）。未批则无法配置 APIv3/证书，赛事 wxpay 不能用。当前 payment flag=false（意向单模式，向后兼容安全）。

### 生产 .env 现状
| key | 状态 |
|---|---|
| WX_APPID / WX_SECRET | ✅ 真值（wx8c37d7ac5b7d0a83）|
| WX_MCH_ID | ✅ key 在（值待真）|
| WX_PAY_KEY（APIv3 32 字节）| ✅ key 在（值待真）|
| WX_MCH_SERIAL_NO | ✅ key 在（值待真）|
| WX_MCH_PRIVATE_KEY_PATH | ✅ 指向 /etc/qmwx/apiclient_key.pem |
| WX_NOTIFY_URL | ✅ https://qingmulife.cn/api/wxpay |

### 缺
- `/etc/qmwx/apiclient_key.pem`（商户私钥，待上传）
- DB `feature_flags.payment=true`（待 wxpay 就绪后改）

### 商户号批后步骤
1. 微信支付商户平台拿：APIv3 密钥（32 字节）+ 商户证书序列号 + `apiclient_key.pem`
2. 填生产 .env 真值（`WX_MCH_ID` / `WX_PAY_KEY` / `WX_MCH_SERIAL_NO`）
3. 上传 `apiclient_key.pem` → 生产 `/etc/qmwx/`（`WX_MCH_PRIVATE_KEY_PATH` 指向）
4. 商户平台 → 产品中心 → AppID 授权管理（关联 `wx8c37d7ac5b7d0a83`）
5. 改 DB payment flag：
   ```bash
   docker exec qmwx-pg psql -U postgres -d qmwx -c \
     "UPDATE \"AppConfig\" SET value = jsonb_set(value::jsonb, '{payment}', 'true') WHERE id='feature_flags';"
   ```
6. 重启 server（`docker compose -f docker-compose.prod.yml restart server`）使 payment flag 生效

### 验证 wxpay 就绪
- 跑一笔小额赛事报名（fee>0）→ `wx.requestPayment` → 回调 paid → enrollment confirmed
- 查 `docker exec qmwx-pg psql -U postgres -d qmwx -c "SELECT status FROM \"Enrollment\" WHERE orderId IS NOT NULL ORDER BY createdAt DESC LIMIT 3;"`（应为 confirmed）

---

## 二、真机验证清单（小程序上传后）

### 上传方式
微信开发者工具打开 `apps/miniprogram/` → 上传 → 体验版扫码

### 功能验证矩阵
| 功能 | 入口 | 预期 |
|---|---|---|
| 评价-发表 | order-list 完成订单「去评价」| review-publish（选星+图+内容）→ 提交成功 |
| 评价-商品详情 | product-detail | 评价段（汇总 avg/count + 前 3 条 + 查看全部）|
| 评价-全部 | review-list | 分页列表 + 图片预览 + 商家回复（如 admin 回复过）|
| 评价-我的 | mine「我的评价」| 我写的评价列表 |
| 赛事-报名 | content-list 赛事 → enroll | payment=OFF 意向单 / payment=ON wxpay（待配置）|
| 赛事-我的报名 | mine「我的报名」| my-enrollments 列表 |
| 用户主页-动态 tab | feed 头像点进 → user 页 | 资料/动态 tab 切换 + 动态列表 |
| 微信运动 V0.1.43 | werun 页 | 月度柱状图 + 手动同步 |
| onboarding | 重新激活授权 | 4 步式（profile + 头像 + 微信运动）|
| 蓝牙 BLE V0.1.43 | device-bind | 扫描 + 心率订阅（小米/佳明）|

### 已知限制
- 评价回复 admin UI（qm-admin 独立 repo，待）
- 赛事 wxpay（商户号申请中）
- 用户主页收藏 tab（隐私，未加 — 别人收藏不公开）

---

## 三、回滚

如真机验证严重 bug：
1. 生产 docker image 回退（`git checkout <旧 tag>` + rebuild，或 docker 旧 image tag）
2. DB payment flag 回 false（关赛事 wxpay）：
   ```bash
   docker exec qmwx-pg psql -U postgres -d qmwx -c \
     "UPDATE \"AppConfig\" SET value = jsonb_set(value::jsonb, '{payment}', 'false') WHERE id='feature_flags';"
   ```
3. 小程序回退版本（微信开发者工具历史版本）

---

## 四、版本追溯

本次验证对应 V0.1.112~121（10 版本）：
- V0.1.112 GAP-3.5 routes 全测 / V0.1.113 评价系统 / V0.1.114 我的评价+赛事 myEnrollments+部署
- V0.1.115 docker fix / V0.1.116 review-list / V0.1.117 评价回复+赛事 wallet+用户 tab
- V0.1.118/120/121 测试补漏 / V0.1.119 赛事 wxpay 真集成

详见根 `CLAUDE.md` Changelog。
