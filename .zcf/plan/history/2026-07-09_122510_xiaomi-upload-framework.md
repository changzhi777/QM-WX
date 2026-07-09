# 小米数据包上传框架（方案 a，等样本期间先做）

> 任务：等小米隐私中心导出样本期间，先做上传框架（不解析）
> 启动：2026-07-09
> 关联：方案 B2（先导出样本），样本到后接解析（阶段 2）

## 阶段 1（本次）：上传框架
- 后端 device POST /uploadXiaomiZip（multipart 接收 ZIP → adm-zip 解压 → 返回文件树 + JSON 前 500 字）
- 小程序 data-import-guide 小米 action 改真实上传（wx.chooseMessageFile 选 .zip）
- shared ENDPOINTS 加 uploadXiaomiZip
- 临时返回结构（确认格式，不做入库）

## 阶段 2（样本到后）：解析 + 入库
- 看真实格式（字段名/时间格式/结构）
- 写精确解析 → HeartRateRecord / SpO2Record / WeRunRecord / SleepRecord（新表？）
- 历史曲线展示全量

## 文件清单（阶段 1）
- apps/server/package.json（+adm-zip）
- apps/server/src/modules/device/device.routes.ts（+POST /uploadXiaomiZip）
- apps/server/src/modules/device/device.service.ts（+parseXiaomiZipStructure helper）
- packages/shared/src/api-contracts/endpoints.ts（+uploadXiaomiZip）
- apps/miniprogram/miniprogram/pages/data-import-guide/index.ts（小米 action 改真实上传）
