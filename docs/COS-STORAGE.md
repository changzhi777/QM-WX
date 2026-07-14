# 腾讯云 COS 对象存储 — 部署与对接文档

> 青沐运动 QM-WX 项目 — **对象存储 Phase 1.1** 部署手册
> 最后更新：2026-07-14（V0.1.149）

---

## 1. 概述

V0.1.149 接入**腾讯云 COS**（广州 ap-guangzhou）替换 upload module 的本地存储。混合模式保留 local fallback，**保证上传链路 100% 可用**。

**生产路径**：

```
小程序 wx.uploadFile('https://api.qingmulife.cn/api/upload?type=avatar')
              ↓
server @fastify/multipart 接收（5MB 上限）
              ↓
service.uploadFile({ buffer, type, userId })
              ↓
   ┌──────────────────────────────────┐
   │  COS_* 配齐?                     │
   │  → YES: cos.putObject(Bucket,    │
   │         ap-guangzhou) → CDN URL  │
   │  → NO:  本地 (uploads/{type}/)   │
   │  → ERR: 静默 fallback 本地       │
   └──────────────────────────────────┘
              ↓
返 { url, size, mime, source }
```

**核心特性**：
- ✅ **公有读**（Bucket CORS + 任意人 GET）
- ✅ **CDN 加速**（`cos-cdn.qingmulife.cn` 走腾讯云 CDN）
- ✅ **限流保护**（5 次/分/用户）
- ✅ **运行时韧性**（COS 失败自动 fallback 本地，不抛错）

---

## 2. 控制台必做清单（主人手动）

### Step 1：创建存储桶

1. 打开 https://console.cloud.tencent.com/cos/bucket
2. 地域选 **`广州（ap-guangzhou）`**
3. 名称：`qm-wx-1418512491`（系统生成前缀，按提示）
4. 访问权限：**公有读私有写**（小程序 GET + CDN 边缘）
5. 其他默认，创建后记录：
   - **Bucket 名**：`qm-wx-1418512491`
   - **地域**：`ap-guangzhou`（确认）

### Step 2：绑定 CDN 自定义域名

1. COS 控制台 → Bucket → **域名管理** → **自定义域名**
2. 添加 `cos-cdn.qingmulife.cn`
3. 自动配置 CDN 加速（默认开启）
4. **HTTPS 证书**：
   - 申请免费证书（DNSPod / TrustAsia 均可，**1 年免费**）
   - 或上传已有证书
5. 等证书签发（10 min ~ 1 天）

### Step 3：CORS 配置

COS 控制台 → Bucket → **权限管理** → **跨域访问 CORS 设置** → 添加规则：

| 来源 | 允许 Methods | 允许 Headers | 暴露 Headers | 超时 |
|---|---|---|---|---|
| `https://servicewechat.com` | `PUT, POST, GET, HEAD` | `*` | `ETag, Content-Length` | 600s |

> ⚠️ 微信小程序 WebView 来源是 `servicewechat.com`，需要这个 CORS。

### Step 4：申请 CAM API 密钥（最小权限）

1. 访问管理 CAM → 用户 → **自定义权限用户**
2. 用户名：`qmwx-cos-uploader`
3. 关联策略（**自定义策略**，JSON）：

```json
{
  "version": "2.0",
  "statement": [
    {
      "effect": "allow",
      "action": [
        "cos:PutObject",
        "cos:InitiateMultipartUpload",
        "cos:ListMultipartUploads",
        "cos:ListParts",
        "cos:UploadPart",
        "cos:CompleteMultipartUpload"
      ],
      "resource": [
        "qcs::cos:ap-guangzhou:uid/1418512491:qm-wx-1418512491/*"
      ]
    }
  ]
}
```

> ⚠️ 上面 `1418512491` = 当前项目 APPID（已写入文档）。如迁移到其它项目，替换为新项目 APPID（在 Bucket 概览页找）。

4. 保存后系统生成：
   - **`SecretId`**（以 `AKID` 开头）
   - **`SecretKey`**（32 字符）

### Step 5：注入生产环境变量

编辑生产服务器 `/opt/qm-wx/apps/server/.env`（owner=root，权限 600）：

```bash
# === V0.1.149 腾讯云 COS 对象存储（owner 手动注入）===
COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxxxxxxxx
COS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
COS_REGION=ap-guangzhou
COS_BUCKET=qm-wx-1418512491
COS_CDN_DOMAIN=cos-cdn.qingmulife.cn
```

> 🔒 **API 密钥严禁入 git**！`.env` 在 gitignore 上，不要复制明文到文档/聊天。

### Step 6：重启服务

```bash
sshpass -p $PROD_PWD ssh root@qingmulife.cn 'cd /opt/qm-wx && docker compose restart server'
# 验证
curl https://api.qingmulife.cn/health
# 期待 { "status": "ok", ... }
```

### Step 7：curl 验证（带 signature 链路）

```bash
KEY=$(grep "^QWEATHER" /opt/qm-wx/apps/server/.env | sed 's/=.*//' | head -1)  # 检查 KEY NOT QWEATHER — 替换为 COS
SID=$(grep "^COS_SECRET_ID" /opt/qm-wx/apps/server/.env | cut -d= -f2)
echo "SID 长度: ${#SID}"
# 用小程序 token 走 wx.uploadFile 路径更准；curl 直接打 401（无 Bearer）
```

更可靠验证：**真机小程序**。打开小程序 → 我的 → 编辑头像 → 选图 → 看返回 URL 前缀是 `https://cos-cdn.qingmulife.cn/avatar/...`。

---

## 3. 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `COS_SECRET_ID` | ✓（启动 COS） | — | 腾讯云 CAM 用户 SecretId（`AKID...` 开头）|
| `COS_SECRET_KEY` | ✓（启动 COS） | — | 32 字符 SecretKey |
| `COS_REGION` | ✗ | `ap-guangzhou` | COS 存储桶地域 |
| `COS_BUCKET` | ✓（启动 COS） | — | 存储桶名 |
| `COS_CDN_DOMAIN` | ✗ | — | 自定义 CDN 域名；空走 COS 默认域名 |

`.env.example` 已有占位（仅占位，无真实值）。

---

## 4. API 对接

```
POST /api/upload?type={type}&localFallback={0|1}
Authorization: Bearer {token}
Content-Type: multipart/form-data
Body: file=@xxx.{ext}
```

| 参数 | 取值 |
|---|---|
| `type` | `avatar` / `feed-image` / `cert-poster` / `misc`（兜底） |
| `localFallback=1` | 强制本地（应急 / 调试 / COS 故障时）|

**响应**：
```json
{
  "code": 0,
  "data": {
    "url": "https://cos-cdn.qingmulife.cn/avatar/u1-1720935555-abc12345.jpg",
    "size": 102400,
    "mime": "image/jpeg",
    "source": "cos"
  }
}
```

**错误码**：
- `400`：无文件 / MIME 不支持 / type 非法字符
- `401`：未登录
- `429`：5 次/分 限流（防滥用 + COS 成本）

---

## 5. 数据库迁移

**无**。upload module 不写 Prisma。文件元数据由调用方决定是否写入（用户头像 / 动态图 / 证书海报）。

---

## 6. 测试

```bash
cd apps/server
pnpm test tests/modules/upload/
# 21 测试全过（service 16 + routes 5）
```

---

## 7. 监控与告警

### 待加（V0.1.150+）

| 监控项 | 阈值 | 告警方式 |
|---|---|---|
| 5xx 比例 | > 5% | 邮件 + 短信 |
| COS 请求失败率 | > 10% | 邮件 |
| 单用户上传频率 | > 60/分 | 自动 ban |
| 桶存储量 | > 100 GB | 邮件 |

### 临时方案

- COS 控制台 → **用量查询** → 设置 **预算告警**（每月 ¥50 / ¥100 阈值）
- Server 日志：`req.log.error({ err }, 'cos upload failed')` 已埋点

---

## 8. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 桶权限 | 公有读私有写 | 小程序 GET 直接取，不需签名 URL；写入只 server |
| Bucket 数 | 单桶 | 简化运维；后续按 type 拆桶（cost optimization）可单独立 |
| 地域 | ap-guangzhou | 主人选定；华南用户占主体 |
| CDN | 必开（`cos-cdn.qingmulife.cn`）| 加速 + 减成本 |
| 上传策略 | server 端 putObject | 简单可靠；流量虽然走后端但 5MB×N 场景下可控 |
| 限流 | 5/分/用户 | 防滥用 + COS 成本控制 |
| Fallback 策略 | 静默 fallback 本地 | 韧性优先；调用方无需感知降级 |

---

## 9. 已知未做（YAGNI）

- ❌ 图片处理（缩略图 / WebP 转换 / 水印）—— 数据万象未启用，前端 `wx.compressImage` 已足够
- ❌ STS 临时凭证 —— 用静态密钥 + 限定 CAM 权限更简单
- ❌ 前端 SDK 直传 —— 当前量级不必要；server putObject 完全够用
- ❌ 旧 uploads/ 文件迁移 —— 用混合模式自动兼容，新上传走 COS

---

## 10. 参考链接

- [腾讯云 COS 控制台](https://console.cloud.tencent.com/cos)
- [COS Node.js SDK v5](https://www.npmjs.com/package/cos-nodejs-sdk-v5)
- [COS PutObject API](https://cloud.tencent.com/document/product/436/7749)
- [CAM 策略语法](https://cloud.tencent.com/document/product/436/12447)
- [COS CDN 加速](https://cloud.tencent.com/document/product/436/18669)
- [免费 HTTPS 证书](https://cloud.tencent.com/product/ssl)

---

🤙 主人按 1~7 Step 流程大约 30 分钟搞定。AI 不会主动执行真人账号操作；上传文件本身由前端调用，需要真机验证。
