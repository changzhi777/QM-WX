# C 部署清单 — Terra API key + 体验版上传

> 青沐运动 QM-WX 项目 — **遗留挂账** 清单（**C 部分主人手动操作项**）
> 最后更新：2026-07-14（V0.1.148）

---

## 🎯 作用

挂在 backlog 里等着主人手动做的两件事，本文件汇总操作步骤 + 验证方法。AI 帮不上忙（需账号 / 真人扫码），但能告诉你**流程怎么走 + 怎么验**。

---

## 1. Terra API key 配置（V0.1.128 COROS 三轨，**仍需配置**）

### 背景

V0.1.128 实现了 COROS 三轨接入（BLE 心率 + FIT 导入 + **Terra 聚合**），`device.terra-client.ts` 已就绪，但 **Terra API key 未配置** —— 因此 COROS 用户无法走第 3 轨自动同步。**该问题已挂账 4+ 个 PATCH 版本**。

### 操作步骤

1. **登录 Terra 控制台**
   - 浏览器打开 https://terradao.gitbook.io/terra-api/
   - 用项目相关邮箱注册/登录（参考 COROS / 佳明绑定的同一身份）

2. **申请 Terra API key**
   - 控制台 → "Developers" → "API keys"
   - 新建 key → 命名 `qmwx-coros-sync`
   - 复制 `API_KEY` 和 `DEV_ID`
   - 如开通 Webhook 服务，复制 `WEBHOOK_SECRET`

3. **写入 `apps/server/.env`**
   ```bash
   # V0.1.128 COROS Terra 聚合（配齐后 COROS 活动自动同步）
   TERRA_API_KEY=<your-terra-api-key>
   TERRA_DEV_ID=<your-terra-dev-id>
   TERRA_WEBHOOK_SECRET=<your-terra-webhook-secret>
   ```

   `.env.example` 已有占位，无需改。

4. **重启服务**（自动应用 env）
   ```bash
   docker compose restart server
   ```

5. **验证：COROS 设备绑定**
   - 打开小程序 → 我的 → BLE 绑定 → 选 COROS
   - 应看到「Terra 已连接」状态
   - 后端日志：`[terra-client] user xxx subscribed`

### 不操作的影响

- ✅ COROS BLE 心率（V0.1.43）正常工作
- ✅ COROS FIT 文件导入（V0.1.128）正常工作
- ❌ Terra 自动历史活动同步不工作（CORS 设备需手动逐活动导入）

---

## 2. 微信开发者工具 — 体验版上传（**V0.1.148 待上传**）

### 背景

最近 commit `677f81a` (V0.1.148) 还没传体验版给真人扫码测试。**已挂账多版本**（从 V0.1.142 提示过）。

### 前置准备

- **微信开发者工具** 已安装（macOS：`/Applications/wechatwebdevtool.app`）
- 已用项目管理员微信扫码登录
- 已配置体验版 AppID（`wx8c37d7ac5b7d0a83`）

### 操作步骤

1. **打开项目**
   - 启动"微信开发者工具"
   - 顶部菜单 → "导入项目"
   - 项目目录：`/Users/mac/Documents/Claude/Projects/QM-WX/apps/miniprogram/miniprogram/`
   - AppID：`wx8c37d7ac5b7d0a83`
   - 项目名：青沐运动

2. **编译验证**
   - 工具顶部 → "编译" 按钮
   - 等待编译完成（左下角状态栏 "编译成功"）
   - 控制台无红色 error

3. **上传代码**
   - 顶部 → "上传" 按钮
   - 版本号：`0.1.148`
   - 项目备注：`V0.1.148 全局品牌色统一 + 多页 UI 优化`
   - 点击 "上传"

4. **公众平台设为体验版**
   - 浏览器打开 https://mp.weixin.qq.com/
   - 用管理员微信扫码
   - 左侧菜单 → "版本管理"
   - 找到刚上传的 `0.1.148`
   - 设为体验版

5. **邀请测试人员扫码**
   - mp.weixin.qq.com → "成员管理" → "体验成员"
   - 添加测试人员的微信号
   - 测试人员微信扫码 → 打开"青沐运动" → 体验版

### 验证项目

- 品牌色变化：tabBar / mine / AI 私教顶部应是 `#2D9D78`（深绿色）
- 天气 tab：能显示长沙实时天气
- AI 私教 tab：能进 tab 不依赖功能开关
- 多页 UI：emoji 已替换为文字

### 不操作的影响

- ✅ 本地小程序可正常调试
- ❌ 真人（同事/客户）扫码看不到最新版本

---

## 📋 主操作核对清单

| 项 | 操作人 | 验证方式 |
|---|---|---|
| Terra API key 申请 + 写入 | 主人（Terra 控制台） | `curl https://api.terra.com/v1/...` 或小程序 COROS 绑定界面 |
| 微信体验版上传 V0.1.148 | 主人（开发者工具） | 体验成员扫码看到深绿品牌色 |
| 真机验证（V0.1.132~148 累计 17 PATCH）| 体验成员 | 跑鞋对比 / 鞋评 / 证书海报 / 自定义里程碑 / 赛事排行榜 / 收藏合集 / AI 私教 |

---

## 📚 相关参考

- [TERRA API 文档](https://terradao.gitbook.io/terra-api/)
- [COROS 接入方案（V0.1.128）](./COROS-3-WAYS.md)（若存在）
- [STAGING_DEPLOY.md](./STAGING_DEPLOY.md) — 部署架构总览
- [PHASE-4-2-PREP.md](./PHASE-4-2-PREP.md) — 真生产切流前 checklist（包含商户号/证书/env 模板）

---

🤙 主人手动操作 30 分钟内能搞定这两件。AI 不会主动执行真人账号相关的动作 —— 这是**安全边界**。
