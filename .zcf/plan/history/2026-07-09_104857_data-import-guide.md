# 数据导入引导页（方案 1 + 9 品牌 + 截图）

> 任务：首页加数据导入图文引导页，按品牌列表，国内源链接
> 启动：2026-07-09 10:29

## 需求
1. 各品牌数据导出链接用国内官网（佳明 connect.garmin.cn / 小米 account.xiaomi.com 等）
2. 首页加引导页入口，品牌列表（9 品牌），点品牌展开图文说明（国内源 + 步骤 + 截图 + 跳转）

## 方案 1（单页展开）
- pages/data-import-guide/（新页）
- 品牌宫格（复用 DEVICE_BRANDS）+ 点品牌展开图文
- shared IMPORT_GUIDE 单一数据源（每品牌 sourceUrl + steps[] + action）
- 截图约定 /images/import-guide/{brand}-{n}.png（前端补图自动渲染）

## 文件清单
- packages/shared/src/constants/device-brands.ts（+IMPORT_GUIDE 配置）
- apps/miniprogram/miniprogram/pages/data-import-guide/{ts,wxml,wxss,json}（新建）
- apps/miniprogram/miniprogram/pages/index/{wxml,ts,wxss}（+入口卡）
- apps/miniprogram/miniprogram/app.json（+注册）
- apps/miniprogram/miniprogram/images/import-guide/README.md（截图命名规范）

## 9 品牌数据
- garmin：connect.garmin.cn → garmin-data ✅
- xiaomi：account.xiaomi.com → 上传待做
- werun：微信运动 → device-bind ✅
- ble：心率广播 → device-bind ✅
- huawei/honor/coros/suunto/zepp：敬请期待
