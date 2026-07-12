/**
 * 短信发送（V0.1.129，stub + 阿里云预留）
 *
 * 生产对接阿里云 dysmsapi 或腾讯云 SMS（SMS_AK/SK/SIGN/TEMPLATE 配齐后）
 * 当前 stub：仅日志，dev 直接返验证码方便测试
 */
import { env } from '../../../config/env.js';
import { logger } from '../../../common/logger.js';

export async function sendSms(
  phone: string,
  code: string,
): Promise<{ ok: boolean; devCode?: string }> {
  if (!env.SMS_AK || !env.SMS_SK) {
    logger.warn({ phone }, '[SMS stub] 验证码未发送（未配置 SMS_AK/SK）');
    // dev/test 直接返码方便联调；生产不泄露
    return { ok: true, devCode: env.NODE_ENV === 'production' ? undefined : code };
  }
  // TODO: 阿里云 dysmsapi SendSms 对接（env.SMS_SIGN + env.SMS_TEMPLATE）
  throw new Error('SMS 真实发送未实现（需对接阿里云/腾讯云）');
}
