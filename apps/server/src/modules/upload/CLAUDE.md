# upload Module — AI 上下文

> 📍 面包屑：[根目录](../../../../CLAUDE.md) > [apps/server](../../../CLAUDE.md) > modules > **upload**

## 职责

接收小程序文件上传（multipart），统一接入**腾讯云 COS 对象存储**（V0.1.149 起），保留**本地 fallback** 的混合模式。**单 endpoint**：`POST /api/upload?type=xxx`。

---

## 入口

- **路由注册**：`app.ts` `await app.register(uploadRoutes, { prefix: '/api/upload' })`
- **Action**：单一 `POST /`（无 action dispatch，纯 multipart）
- **鉴权**：全部路由需登录（`req.user.id` 必需）

---

## API

```
POST /api/upload?type={type}&localFallback={0|1}
Header: authorization: Bearer {token}
Body: multipart/form-data, field name="file"
```

| 参数 | 必填 | 取值 | 默认 |
|---|---|---|---|
| `type` | ✗ | `avatar` \| `feed-image` \| `cert-poster` \| `misc`（限小写字母数字横杠 1-32 字符） | `misc` |
| `localFallback` | ✗ | `1` → 强制本地 | `0` |

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

`source: 'cos' | 'local'`：实际走的存储，便于排查。

---

## 混合模式（V0.1.149）

| 触发条件 | 行为 |
|---|---|
| COS 配置完整（`COS_SECRET_ID`+`_KEY`+`_BUCKET`+`_REGION` 都有）| 走 COS putObject → 返 COS URL（优先 CDN 域名）|
| 上述任一缺失 | 静默走本地（`uploads/{type}/...`）|
| COS putObject 运行时抛错（如 401/网络）| **静默 fallback 本地**（韧性优先，不抛错）|
| `?localFallback=1` | **强制本地**（应急/调试）|

**策略**：服务端权威 + 自动降级 —— 上传链路 100% 可用，但生产路径走 COS，零事故下用户无感知降级。

---

## 数据模型

无 Prisma 表。文件元数据由调用方自行决定是否持久化：
- `User.avatarUrl` 头像场景
- `Feed.images[]` 动态场景
- `Certificate.posterUrl` 证书场景（V0.1.135 Canvas 海报）

---

## 集成点

- **被调用方**：前端 `services/api.ts:uploadFile()` 中心封装，被以下场景调用：
  - `components/profile-popup/index.ts:50` — 头像选择
  - `pages/onboarding/index.ts:31` — V0.1.43 onboarding 第 3 步
  - `pages/device/index.ts:589,611` — 设备图片（BLE 固件 / COROS FIT）
- **调用方**：腾讯云 COS（cos-nodejs-sdk-v5）+ 本地 `node:fs/promises`
- **缓存**：无
- **BullMQ**：无
- **notify**：无

---

## 测试

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/modules/upload/upload.service.test.ts` | 16 | constants / shouldUseCos / uploadToLocal / uploadToCos / uploadFile 派发 + fallback |
| `tests/modules/upload/upload.routes.test.ts` | 5 | 鉴权 / mime 边界 / type 透传 / localFallback / 多 type |

**覆盖率**：
- service.ts：~100%（核心派发 + fallback 全分支）
- routes.ts：~95%（query/type 边界 + 限流配置）

---

## 关键范式与坑

1. **混合模式派发（V0.1.149 核心）**
   - 入口 `uploadFile()` 在 service.ts
   - 缺配置 / 抛错 → 自动 fallback 本地
   - `?localFallback=1` → 强制本地（调试）

2. **环境变量缺一不可**
   - `COS_SECRET_ID` + `COS_SECRET_KEY` + `COS_BUCKET` + `COS_REGION`（后 3 个 optional 但 COS 配齐需要全）
   - `COS_REGION` 默认 `ap-guangzhou`（与 CDN 域名一致）
   - `COS_CDN_DOMAIN` optional，缺省走 COS 默认域名 `{bucket}-{secretId8}.cos.{region}.myqcloud.com`

3. **CDN 域名优先**
   - `COS_CDN_DOMAIN=cos-cdn.qingmulife.cn` → 公开 URL 用这个
   - 否则走 COS 默认域名（无 CDN 加速）

4. **type 严格校验**
   - `/^[a-z0-9-]{1,32}$/` 防 path traversal / 非法字符落到 object key
   - 不符 → 兜底 `'misc'`

5. **每请求不缓存 COS 实例**
   - 旧版本有 lazy 单例缓存 → 测试难 mock
   - V0.1.149 改造：`getCos()` 每次新建（SDK 构造廉价）
   - 实战场景一次请求单连接，无性能损失

6. **限流配置**
   - 路由 config：`{ rateLimit: { max: 5, timeWindow: '1 minute' } }`
   - 覆盖全局限流（200 req/min/user）
   - 防止恶意上传 + COS 成本控制

7. **MIME 白名单限 image/jpeg + png + webp**
   - 路由层：`UPLOAD_ALLOWED_MIME.includes()` 检查
   - service 层同样兜底
   - 不支持 video / audio —— 留待后续 V0.1.150+ 按需扩展

---

## 版本演进

- **V0.1.x Phase 1** — 本地 `apps/server/uploads/` + `@fastify/static` 暴露 `/uploads/` 前缀
- **V0.1.149** — 🎯 腾讯云 COS 接入 + 混合模式（ap-guangzhou + CDN `cos-cdn.qingmulife.cn` + server putObject + 自动 fallback + 5/min 限流）；16+5 = 21 单测

---

## 部署 checklist

主人手动操作（控制台）：
1. 腾讯云控制台创建存储桶 `qm-wx-1418512491`，地域 `ap-guangzhou`，访问权限**公有读私有写**
2. COS 控制台 → 域名管理 → 绑定自定义域名 `cos-cdn.qingmulife.cn` + 配置 CDN + 申请 HTTPS 证书
3. CORS：允许小程序 AppID 来源（GET/PUT 跨域）
4. 申请 API 密钥（CAM 用户，只授 `PutObject` 权限 + 限定桶）
5. 注入生产 `/opt/qm-wx/apps/server/.env`：
   ```
   COS_SECRET_ID=<AKID>
   COS_SECRET_KEY=<32字符>
   COS_REGION=ap-guangzhou
   COS_BUCKET=qm-wx-1418512491
   COS_CDN_DOMAIN=cos-cdn.qingmulife.cn
   ```
6. `docker compose restart server`
7. 验证：小程序选择头像 → 看 URL 前缀是 `cos-cdn.qingmulife.cn`（不是 localhost/api）

---

🤙 详细部署步骤见 [`docs/COS-STORAGE.md`](../../../../docs/COS-STORAGE.md)
