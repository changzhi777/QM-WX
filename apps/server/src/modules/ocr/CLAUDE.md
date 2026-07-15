# ocr — 腾讯云 OCR module（V0.2.1 第 34 个 module）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/ocr/**（这里）
>
> 创建于 **V0.2.1 / 2026-07-15**（init #10 校准）；**V0.1.151 手写 TC3 版本已被本模块替代**

---

## 🎯 职责

接入 **腾讯云 OCR SDK**（精简包 `tencentcloud-sdk-nodejs-ocr@4.1.267`，v20181119），为小程序提供：
- 通用印刷体识别（运动截图成绩识别 — sport_screenshot 自动打卡的核心环节）
- 通用高精度识别（模糊截图增强）
- 身份证实名识别（赛事报名 / 账户安全）

**替 V0.1.151 手写 TC3 范式**：V0.1.151 infra/ocr.ts 用原生 fetch + TC3-HMAC-SHA256 签名实现 generalOcr，V0.2.1 切官方 SDK 自动签 + 错误处理 + 重试，**复用 COS SecretId/Key**（V0.1.149 子用户 qmwx-cos-uploader 关联 QcloudOCRFullAccess 策略即可）。

**集成链**：
```
device-parser.registry.sport_screenshot(userId, buffer)
  → ocrService.generalBasic(image)         // 返文本行
  → parseSportScore(lines)                  // 提取 distanceKm/durationSec/paceSecPerKm
  → sportService.checkin(...)                // 自动建 Checkin（失败存 OCR 文本可追溯）
```

> 💡 **parseSportScore 仍是纯函数**（保留在 `apps/server/src/infra/ocr.ts`），仅 OCR 调用迁移到本模块；device-parser.registry 通过 ESM 编译期静态解析避免循环 import。

---

## 📂 文件清单

| 文件 | 行数 | 说明 |
| --- | ---: | --- |
| `ocr.client.ts` | 42 | getOcrClient 单例（首次惰性创建，复用 COS SecretId/Key + region = COS_REGION 广州）+ isOcrConfigured 校验 + __resetOcrClientForTest |
| `ocr.service.ts` | 63 | 3 action：generalBasic / generalAccurate / idCard + ensureConfigured 双重防御 |
| `ocr.routes.ts` | 35 | POST /api/ocr { action, payload:{imageBase64} } + Buffer.from(b64,'base64') + switch 分发 |

**测试**：
- `apps/server/tests/modules/ocr/ocr.client.test.ts`（5 用例）
- `apps/server/tests/modules/ocr/ocr.service.test.ts`（7 用例）
- `apps/server/tests/modules/ocr/ocr.routes.test.ts`（6 用例）
- **合计 18 单测**

---

## 🚪 API（3 action）

| Action | Payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `generalBasic` | `{ imageBase64: string }` | `{ lines: string[] }` | 通用印刷体（快，运动截图成绩） |
| `generalAccurate` | `{ imageBase64: string }` | `{ lines: string[] }` | 通用高精度（准但慢，模糊截图增强） |
| `idCard` | `{ imageBase64: string }` | `{ card: { name, idNo, sex, birth, address } }` | 身份证实名（赛事报名 / 账户安全） |

**输入**：imageBase64（前端截图/相册图转 base64，**不含 data:image 前缀**）

---

## 🔑 环境变量（**复用 COS KEY**）

```bash
# .env / .env.example（V0.1.149 COS 已加）
COS_SECRET_ID=xxx        # 子用户 qmwx-cos-uploader 的 SecretId
COS_SECRET_KEY=xxx       # 子用户 qmwx-cos-uploader 的 SecretKey
COS_REGION=ap-guangzhou  # 广州（默认）
```

**前置条件**：
- 主人手动在腾讯云 CAM 控制台 → 用户 `qmwx-cos-uploader` → 关联策略 `QcloudOCRFullAccess`（**与 COS 策略并列**，**不替换** COS 策略）
- 同 key 复用 → 避免新密钥管理

**未配置时**：
- `isOcrConfigured()` 返 `false`
- routes 层 + service 层双重 `ensureConfigured()` → 抛 `badRequest: OCR 未配置（COS_SECRET_ID/KEY 缺失）`

---

## 🧪 测试覆盖

**18 单测**：
- `ocr.client.test.ts` 5 例（单例 + 双重校验 + isOcrConfigured 边界）
- `ocr.service.test.ts` 7 例（3 action + ensureConfigured 抛错 + 字段映射）
- `ocr.routes.test.ts` 6 例（3 action switch + imageBase64 解析 + Buffer 转换 + 鉴权）

**Mock 范式**：
```ts
vi.mock('tencentcloud-sdk-nodejs-ocr', () => ({
  ocr: { v20181119: { Client: vi.fn().mockImplementation(() => ({ GeneralBasicOCR: vi.fn(), GeneralAccurateOCR: vi.fn(), IDCardOCR: vi.fn() })) } },
}));
```

---

## ⚠️ 关键设计决策

1. **复用 COS KEY**：V0.1.149 子用户 qmwx-cos-uploader 已就位；V0.2.1 只需主人手动在控制台关联 `QcloudOCRFullAccess` 策略 → 零新密钥管理
2. **官方 SDK 替手写 TC3**：V0.1.151 原生 fetch + TC3-HMAC-SHA256 已删（SDK 自动签 + 错误处理 + 重试）
3. **getOcrClient 单例**：首次惰性创建，后续复用（避免每次请求 new 客户端开销）
4. **ensureConfigured 双重防御**：routes 层 + service 层都做 `isOcrConfigured()` 校验（**P0 防未配置直接调用 SDK 报更模糊错误**）
5. **parseSportScore 保留**：纯函数留在 `infra/ocr.ts`，device-parser.registry 调用 ocrService 后再走 parseSportScore（无循环 import — ESM 编译期静态解析）

---

## 📦 依赖

```json
{
  "tencentcloud-sdk-nodejs-ocr": "^4.1.267"
}
```

**装包**：`pnpm --filter server add tencentcloud-sdk-nodejs-ocr`

---

## 🚧 待办

- [ ] 主人手动在腾讯云 CAM 控制台关联 `QcloudOCRFullAccess` 策略到子用户 `qmwx-cos-uploader`（与 COS 策略并列）
- [ ] OCR 真生产切真（CAM 策略就位后，ocrService 调 Tencent Cloud OCR SDK）
- [ ] V0.1.151 huawei_export 样本待主人提供（parser stub 等样本）

---

## 📚 关联历史

- **V0.1.151**：手写 TC3-HMAC-SHA256 + 原生 fetch generalOcr + parseSportScore（infra/ocr.ts）；已被本模块替代
- **V0.1.150**：sport_screenshot 自动打卡（device-parser.registry 调 OCR → parseSportScore → sportService.checkin）
- **V0.1.149**：COS 子用户 qmwx-cos-uploader 就位（V0.2.1 复用 KEY 前置）

---

🤙 **V0.2.1 完成**：ocr 第 34 个 module，18 单测，3 action（generalBasic/generalAccurate/idCard），复用 COS KEY；下一步主人关联 QcloudOCRFullAccess 策略 + 生产切真。