/**
 * 环境变量校验（启动时强校验，配错直接 fail-fast）
 *
 * 任何模块想用环境变量都从 env.X 取，**不要**直接 process.env.X。
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL: z.string().default('2h'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  WX_APPID: z.string().min(1),
  WX_SECRET: z.string().min(1),
  WX_MCH_ID: z.string().optional(),
  WX_PAY_KEY: z.string().optional(),
  WX_NOTIFY_URL: z.string().url().optional(),
  // V3 证书相关（开发期可空，wxpay service 内部 lazy 校验）
  WX_MCH_SERIAL_NO: z.string().optional(),
  WX_MCH_PRIVATE_KEY_PATH: z.string().optional(),
  WX_PLAT_CERT_PATH: z.string().optional(),

  // 开发态登录旁路：=1 时跳过 code2Session，用固定 dev openid 登录（仅本地调试）。
  // 仅在 NODE_ENV !== production 时生效（见 user.service.login）；生产环境恒视为 false。
  DEV_LOGIN_BYPASS: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),

  // 律动(RHYTHMIND)同步对接:qmwx → 律动 /open/v1/events 出站投递
  LUDONG_SYNC_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  LUDONG_WEBHOOK_SECRET: z.string().default(''),
  LUDONG_BASE_URL: z.string().url().default('http://localhost:8000'),

  // V0.1.130 COROS Terra 聚合（缺省 stub，配齐 API key 后生效）
  TERRA_API_KEY: z.string().optional(),
  TERRA_DEV_ID: z.string().optional(),
  TERRA_WEBHOOK_SECRET: z.string().default(''),

  // V0.1.129 多方式认证（短信/邮件，缺省 stub）
  SMS_AK: z.string().optional(),
  SMS_SK: z.string().optional(),
  SMS_SIGN: z.string().optional(),
  SMS_TEMPLATE: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// 生产环境额外强校验：拒绝明显弱 / 占位 JWT_SECRET，避免误用默认值上线
if (parsed.data.NODE_ENV === 'production') {
  const secret = parsed.data.JWT_SECRET;
  const weak = ['changeme', 'secret', 'default', 'test', 'placeholder', 'your-secret'];
  const looksWeak = secret.length < 32 || weak.some((w) => secret.toLowerCase().includes(w));
  if (looksWeak) {
    console.error(
      '❌ 生产环境 JWT_SECRET 过弱：需 ≥32 字符且不含占位词（changeme/secret/default 等）',
    );
    process.exit(1);
  }

  // 律动同步:启用时密钥必须配置(≥16 字符,防弱密钥上线)
  if (
    parsed.data.LUDONG_SYNC_ENABLED &&
    parsed.data.LUDONG_WEBHOOK_SECRET.length < 16
  ) {
    console.error(
      '❌ 生产环境 LUDONG_SYNC_ENABLED=true 时 LUDONG_WEBHOOK_SECRET 需 ≥16 字符',
    );
    process.exit(1);
  }
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
