/**
 * wxpay service — 微信支付 V3 协议封装
 *
 * 实现：
 * - generateAuthorization  签名生成（商户 → 微信）
 * - unifiedOrder           JSAPI 统一下单
 * - verifyAndDecryptNotify 回调验签 + AES-256-GCM 解密
 * - aesGcmDecrypt          底层加密原语（也可供他处复用）
 *
 * 关键设计：
 * - 纯 Node `crypto`，不引外部 SDK
 * - 私钥 / 平台证书按需读（开发期证书可选）
 * - 微信 API 在事务外调（外部 IO 不可在 DB 事务内）
 */
import {
  createHash,
  createSign,
  createVerify,
  createDecipheriv,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { env } from '../../config/env.js';
import { Errors } from '../../common/errors.js';
import {
  UnifiedOrderInputSchema,
  WxpayNotifyDecryptedSchema,
  RefundInputSchema,
  RefundRespSchema,
  type UnifiedOrderInput,
  type UnifiedOrderResp,
  type RefundInput,
  type RefundResp,
  type WxpayNotifyDecrypted,
} from './wxpay.schema.js';

const WXPAY_HOST = 'https://api.mch.weixin.qq.com';

// ===== 内部缓存：私钥 + 平台证书（开发期空） =====
let _privateKeyPem: string | null = null;

function loadPrivateKey(): string {
  if (_privateKeyPem) return _privateKeyPem;
  const path = env.WX_MCH_PRIVATE_KEY_PATH;
  if (!path) {
    throw Errors.internal('WX_MCH_PRIVATE_KEY_PATH 未配置（需商户 API 私钥）');
  }
  _privateKeyPem = readFileSync(resolve(path), 'utf8');
  return _privateKeyPem;
}

// ===== 平台证书存储（支持轮换：多张证书按序列号并存） =====
/** serial（大写 hex）→ PEM */
const _platformCerts = new Map<string, string>();
let _platformCertsLoaded = false;

/** 解析 PEM 证书序列号（大写 hex，与微信 Wechatpay-Serial 对齐） */
function certSerial(pem: string): string {
  return new X509Certificate(pem).serialNumber.toUpperCase();
}

/**
 * 注册一张平台证书（启动加载 / fetchPlatformCerts 自动拉取都走这里）。
 * @returns 该证书的序列号
 */
export function registerPlatformCert(pem: string): string {
  const serial = certSerial(pem);
  _platformCerts.set(serial, pem);
  _platformCertsLoaded = true; // 手动注册即视为已加载，无需再读 env 文件
  return serial;
}

/** 从 env 加载平台证书（WX_PLAT_CERT_PATH 支持逗号分隔多文件，便于轮换并存） */
function ensurePlatformCertsLoaded(): void {
  if (_platformCertsLoaded) return;
  const path = env.WX_PLAT_CERT_PATH;
  if (!path) {
    throw Errors.internal('WX_PLAT_CERT_PATH 未配置（需微信支付平台证书）');
  }
  for (const p of path.split(',').map((s) => s.trim()).filter(Boolean)) {
    registerPlatformCert(readFileSync(resolve(p), 'utf8'));
  }
  _platformCertsLoaded = true;
}

/**
 * 按序列号取平台证书。
 * 轮换期会同时存在新旧两张证书，必须用回调头 Wechatpay-Serial 精确匹配，
 * 否则验签会错用证书而失败。未知序列号 → 抛错（提示更新 / 触发拉取）。
 */
function getPlatformCert(serial: string): string {
  ensurePlatformCertsLoaded();
  // 兼容：只配了一张证书且回调未带 serial 时，回退到唯一证书
  if (!serial && _platformCerts.size === 1) {
    return [..._platformCerts.values()][0];
  }
  const cert = _platformCerts.get((serial ?? '').toUpperCase());
  if (!cert) {
    throw Errors.internal(
      `未知微信平台证书序列号: ${serial}（可能已轮换）。请更新 WX_PLAT_CERT_PATH 或调用 fetchPlatformCerts 拉取最新证书`,
    );
  }
  return cert;
}

/**
 * 拉取并缓存微信平台证书（V3 协议）
 *
 * 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012153196
 * 端点：GET /v3/certificates（返回的证书用 APIv3 密钥 AES-256-GCM 解密）
 *
 * 用途：平台证书会定期轮换。建议用定时任务（如每 12 小时）调用本函数刷新缓存，
 * 这样回调验签时 getPlatformCert 总能按 serial 命中最新证书。
 *
 * 注意（MVP）：首次拉取无可信证书可验响应签名（先有鸡还是先有蛋），此处暂不验证
 * 响应签名；生产建议拿到首张证书后对后续响应做验签。沙箱测试需 mock fetch。
 *
 * @returns 本次拉取到的证书序列号列表
 */
export async function fetchPlatformCerts(): Promise<string[]> {
  if (!env.WX_PAY_KEY) throw Errors.internal('WX_PAY_KEY 未配置（需 APIv3 密钥）');
  const key = Buffer.from(env.WX_PAY_KEY, 'utf8');
  if (key.length !== 32) throw Errors.internal('WX_PAY_KEY 长度必须为 32 字节');

  const urlPath = '/v3/certificates';
  const auth = generateAuthorization('GET', urlPath, '');
  const res = await fetch(`${WXPAY_HOST}${urlPath}`, {
    method: 'GET',
    headers: { Authorization: auth, 'User-Agent': 'qm-wx-server/1.0', Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw Errors.internal(
      `微信平台证书拉取失败: ${res.status} ${err.code ?? ''} ${err.message ?? ''}`.trim(),
    );
  }
  const data = (await res.json()) as {
    data: Array<{
      serial_no: string;
      encrypt_certificate: { nonce: string; associated_data: string; ciphertext: string };
    }>;
  };

  const serials: string[] = [];
  for (const item of data.data ?? []) {
    const pem = aesGcmDecrypt(
      item.encrypt_certificate.ciphertext,
      key,
      Buffer.from(item.encrypt_certificate.nonce, 'utf8'),
      Buffer.from(item.encrypt_certificate.associated_data, 'utf8'),
    );
    registerPlatformCert(pem);
    serials.push(item.serial_no);
  }
  _platformCertsLoaded = true;
  return serials;
}

// ===== 签名 =====
function sha256WithRsaBase64(message: string, privateKeyPem: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

/** 生成 Authorization 头部（V3 协议） */
export function generateAuthorization(
  method: 'GET' | 'POST',
  urlPath: string,
  body: string,
  options: { mchId?: string; privateKey?: string; serialNo?: string } = {},
): string {
  const mchId = options.mchId ?? env.WX_MCH_ID;
  const serialNo = options.serialNo ?? env.WX_MCH_SERIAL_NO;
  const privateKey = options.privateKey ?? loadPrivateKey();
  if (!mchId) throw Errors.internal('WX_MCH_ID 未配置');
  if (!serialNo) throw Errors.internal('WX_MCH_SERIAL_NO 未配置');
  const nonceStr = randomUUID().replace(/-/g, '').slice(0, 32);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // 签名原文 = METHOD\nURL_PATH\nTIMESTAMP\nNONCE_STR\nBODY\n
  const signMessage = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = sha256WithRsaBase64(signMessage, privateKey);

  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${mchId}",` +
    `nonce_str="${nonceStr}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${serialNo}",` +
    `signature="${signature}"`
  );
}

// ===== 加密原语 =====
/** AES-256-GCM 解密（微信回调 resource.ciphertext 解密用） */
export function aesGcmDecrypt(
  ciphertextBase64: string,
  key: Buffer,
  nonce: Buffer,
  aad: Buffer,
): string {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  // additionalData 必须 set，否则 GCM 验签失败
  decipher.setAAD(aad, { plaintextLength: 0 });
  const ciphertext = Buffer.from(ciphertextBase64, 'base64');
  // 微信 ciphertext 末尾 16 字节是 GCM auth tag
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const body = ciphertext.subarray(0, ciphertext.length - 16);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  return plaintext.toString('utf8');
}

// ===== 业务 API =====
/**
 * 统一下单（JSAPI / 小程序支付）
 *
 * 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012791861
 */
export async function unifiedOrder(input: UnifiedOrderInput): Promise<UnifiedOrderResp> {
  const valid = UnifiedOrderInputSchema.parse(input);
  if (!env.WX_MCH_ID || !env.WX_APPID || !env.WX_NOTIFY_URL) {
    throw Errors.internal('微信支付配置缺失：WX_MCH_ID / WX_APPID / WX_NOTIFY_URL');
  }

  const urlPath = '/v3/pay/transactions/jsapi';
  const body = JSON.stringify({
    appid: env.WX_APPID,
    mchid: env.WX_MCH_ID,
    description: valid.description,
    out_trade_no: valid.outTradeNo,
    notify_url: env.WX_NOTIFY_URL,
    amount: { total: valid.totalFen, currency: 'CNY' },
    payer: { openid: valid.openid },
    time_expire: new Date(Date.now() + (valid.timeExpireSec ?? 1800) * 1000).toISOString(),
  });

  const auth = generateAuthorization('POST', urlPath, body);

  const res = await fetch(`${WXPAY_HOST}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'User-Agent': 'qm-wx-server/1.0',
    },
    body,
  });
  const data = (await res.json()) as { prepay_id?: string; error?: string; message?: string };
  if (!res.ok || !data.prepay_id) {
    throw Errors.internal(
      `微信统一下单失败: ${res.status} ${data.error ?? ''} ${data.message ?? ''}`.trim(),
    );
  }

  // 二次签名：给前端 wx.requestPayment 用的 paySign
  // 字段：appId / timeStamp / nonceStr / package / signType
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomBytes(16).toString('hex');
  const packageStr = `prepay_id=${data.prepay_id}`;
  const signMessage =
    `${env.WX_APPID}\n${timestamp}\n${nonceStr}\n${packageStr}\n`;
  const sign = sha256WithRsaBase64(signMessage, loadPrivateKey());

  return {
    prepayId: data.prepay_id,
    nonceStr,
    timestamp,
    sign,
    packageStr,
  };
}

/**
 * 验签 + 解密微信回调通知
 *
 * 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012071382
 */
export interface VerifyNotifyInput {
  /** 原始 body 字节（不可 JSON parse 后再验） */
  rawBody: string;
  /** 微信头：Wechatpay-Serial / Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature */
  headers: {
    serial: string;
    timestamp: string;
    nonce: string;
    signature: string;
  };
}

export interface VerifyNotifyResult {
  /** 解密后明文 */
  resource: WxpayNotifyDecrypted;
  /** 验签通过 */
  verified: true;
}

/** 回调时间戳允许的偏移窗口（秒）— 超过即视为重放，拒绝 */
const NOTIFY_TIMESTAMP_TOLERANCE_SEC = 300;

export function verifyAndDecryptNotify(input: VerifyNotifyInput): VerifyNotifyResult {
  // 0. 防重放：校验时间戳新鲜度（±5 分钟），过期签名即便合法也拒绝
  const ts = Number(input.headers.timestamp);
  if (!Number.isFinite(ts)) {
    throw Errors.badRequest('微信回调时间戳非法');
  }
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > NOTIFY_TIMESTAMP_TOLERANCE_SEC) {
    throw Errors.badRequest('微信回调时间戳超出允许窗口（疑似重放）');
  }

  // 1. 验签（按 Wechatpay-Serial 选对应平台证书，支持轮换期多证书并存）
  const cert = getPlatformCert(input.headers.serial);
  const verifier = createVerify('RSA-SHA256');
  const signMessage = `${input.headers.timestamp}\n${input.headers.nonce}\n${input.rawBody}\n`;
  verifier.update(signMessage);
  verifier.end();
  const ok = verifier.verify(cert, Buffer.from(input.headers.signature, 'base64'));
  if (!ok) throw Errors.badRequest('微信回调验签失败');

  // 2. 解密 resource
  const env1 = JSON.parse(input.rawBody) as {
    resource: {
      ciphertext: string;
      nonce: string;
      associated_data: string;
    };
  };
  const { ciphertext, nonce, associated_data } = env1.resource;
  if (!env.WX_PAY_KEY) throw Errors.internal('WX_PAY_KEY 未配置（需 APIv3 密钥）');
  const key = Buffer.from(env.WX_PAY_KEY, 'utf8'); // 32 字节
  if (key.length !== 32) {
    throw Errors.internal('WX_PAY_KEY 长度必须为 32 字节');
  }
  const decrypted = aesGcmDecrypt(
    ciphertext,
    key,
    Buffer.from(nonce, 'utf8'),
    Buffer.from(associated_data, 'utf8'),
  );
  const resource = WxpayNotifyDecryptedSchema.parse(JSON.parse(decrypted));

  return { resource, verified: true };
}

/**
 * 检查资源是否代表支付成功
 */
export function isPaySuccess(resource: WxpayNotifyDecrypted): boolean {
  return resource.trade_state === 'SUCCESS';
}

/** 工具：生成 out_trade_no（取 Order.id cuid 也满足 32 字符限制） */
export function toOutTradeNo(orderId: string): string {
  if (orderId.length > 32) {
    // 用 sha256 前 16 字符作 fallback
    return createHash('sha256').update(orderId).digest('hex').slice(0, 32);
  }
  return orderId;
}

/**
 * 申请退款（V3 协议）
 *
 * 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012791865
 * 端点：POST /v3/refund/domestic/refunds
 *
 * 注意：
 * - 必须在 prisma.$transaction 之外调用（外部 IO）
 * - 双向证书：商户私钥签名（已有），平台证书**不需要**（outgoing call）
 * - 沙箱测试：vi.mock('undici' / node-fetch) 拦截 fetch
 */
export async function refund(input: RefundInput): Promise<RefundResp> {
  const valid = RefundInputSchema.parse(input);
  if (!env.WX_MCH_ID) {
    throw Errors.internal('WX_MCH_ID 未配置');
  }
  if (valid.refundFen > valid.totalFen) {
    throw Errors.badRequest(`refundFen (${valid.refundFen}) > totalFen (${valid.totalFen})`);
  }

  const urlPath = '/v3/refund/domestic/refunds';
  const body = JSON.stringify({
    out_trade_no: valid.outTradeNo,
    out_refund_no: valid.outRefundNo,
    reason: valid.reason ?? '用户申请退款',
    ...(valid.notifyUrl ? { notify_url: valid.notifyUrl } : {}),
    amount: {
      refund: valid.refundFen,
      total: valid.totalFen,
      currency: 'CNY',
    },
  });

  const auth = generateAuthorization('POST', urlPath, body);
  const res = await fetch(`${WXPAY_HOST}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
      'User-Agent': 'qm-wx-server/1.0',
    },
    body,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw Errors.internal(
      `微信退款失败: ${res.status} ${err.code ?? ''} ${err.message ?? ''}`.trim(),
    );
  }

  const raw = (await res.json()) as {
    refund_id: string;
    out_refund_no: string;
    out_trade_no: string;
    transaction_id: string;
    channel?: string;
    user_received_account?: string;
    success_time?: string;
    create_time?: string;
    status: string;
    amount: { refund: number; total: number; payer_total?: number; settlement_total?: number };
  };

  return RefundRespSchema.parse({
    refundId: raw.refund_id,
    outRefundNo: raw.out_refund_no,
    outTradeNo: raw.out_trade_no,
    transactionId: raw.transaction_id,
    channel: raw.channel,
    userReceivedAccount: raw.user_received_account,
    successTime: raw.success_time,
    createTime: raw.create_time,
    status: raw.status,
    amount: {
      refund: raw.amount.refund,
      total: raw.amount.total,
      payerTotal: raw.amount.payer_total,
      settlementTotal: raw.amount.settlement_total,
    },
  });
}

// ===== 对账：拉账单 =====
/**
 * 申请交易账单（V3 协议）
 *
 * 文档：https://pay.weixin.qq.com/doc/v3/merchant/4012791831
 * 端点：GET /v3/bill/tradebill
 *
 * 返回 download_url（4 小时有效）— 需在 30 分钟内下载
 *
 * 沙箱测试：需 mock fetch
 */
export interface QueryBillInput {
  /** 账单日期 YYYY-MM-DD */
  billDate: string;
  /** 账单类型：ALL / SUCCESS / REFUND */
  billType?: 'ALL' | 'SUCCESS' | 'REFUND';
  /** 自定义压缩类型：GZIP（默认） */
  tarType?: 'GZIP';
}

export interface QueryBillResp {
  downloadUrl: string;
  hashValue: string;
  hashType: 'SHA1';
}

export async function queryBill(input: QueryBillInput): Promise<QueryBillResp> {
  if (!env.WX_MCH_ID) throw Errors.internal('WX_MCH_ID 未配置');
  const urlPath = '/v3/bill/tradebill';
  const params = new URLSearchParams({
    bill_date: input.billDate,
    bill_type: input.billType ?? 'ALL',
  });
  // GET 请求 body 为空字符串（V3 协议要求）
  const auth = generateAuthorization('GET', `${urlPath}?${params.toString()}`, '');
  const res = await fetch(`${WXPAY_HOST}${urlPath}?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: auth, 'User-Agent': 'qm-wx-server/1.0' },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw Errors.internal(`微信账单查询失败: ${res.status} ${err.message ?? err.code ?? ''}`.trim());
  }
  const raw = (await res.json()) as { download_url: string; hash_value: string; hash_type: 'SHA1' };
  return {
    downloadUrl: raw.download_url,
    hashValue: raw.hash_value,
    hashType: raw.hash_type,
  };
}

/**
 * 下载账单文件
 *
 * 微信返回的是 GZIP 压缩的 CSV
 * 沙箱测试：可 mock 返回解压后的 CSV 字符串
 */
export async function downloadBill(downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw Errors.internal(`账单下载失败: ${res.status}`);
  }
  // 微信账单默认 GZIP 压缩。用 gzip 魔数（0x1f 0x8b）自动判断：
  // 压缩则解压成 CSV 文本，否则按原文返回（兼容沙箱/未压缩账单）。
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf).toString('utf8');
  }
  return buf.toString('utf8');
}
