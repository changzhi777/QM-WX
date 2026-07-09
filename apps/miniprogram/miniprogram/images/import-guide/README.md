# 数据导入指南截图（V0.1.43）

小程序「数据导入指南」页各品牌步骤截图存放目录。

## 命名规范

格式：`{brand}-{n}.png`（brand = DEVICE_BRANDS.key，n = 步骤序号）

## 需要的截图（按品牌）

### 佳明 garmin（2 步）
- `garmin-1.png` — 佳明中国官网导出数据包（connect.garmin.cn → 账户 → 导出）
- `garmin-2.png` — 小程序佳明数据处理页上传

### 小米 xiaomi（3 步）
- `xiaomi-1.png` — 小米账号隐私中心「查阅和管理您的数据」（account.xiaomi.com）
- `xiaomi-2.png` — 选择 MI Fitness → 下载（密码 = ZIP 解压密码）
- `xiaomi-3.png` — 邮件通知 + 下载 ZIP

### 微信运动 werun（2 步）
- `werun-1.png` — 微信关注「微信运动」公众号开启步数
- `werun-2.png` — 设备绑定页「同步微信运动」按钮

### 蓝牙 BLE ble（2 步）
- `ble-1.png` — 手环设置 → 蓝牙 → 心率广播 → 开启
- `ble-2.png` — 设备绑定页扫描绑定

## 说明

- 图片缺失时页面显示灰色「📷 截图待补」占位（不影响功能）
- 补图后放到本目录，自动渲染（路径在 shared `IMPORT_GUIDE` 配置）
- 建议尺寸：750×400（宽高比约 2:1），PNG/JPG
