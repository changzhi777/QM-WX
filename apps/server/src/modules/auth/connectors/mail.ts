/**
 * 邮件发送（V0.1.129，stub + nodemailer 预留）
 *
 * 生产对接 nodemailer SMTP（SMTP_HOST/PORT/USER/PASS 配齐后）
 * 当前 stub：仅日志
 */
import { env } from '../../../config/env.js';
import { logger } from '../../../common/logger.js';

export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean }> {
  if (!env.SMTP_HOST) {
    logger.warn({ to, subject, htmlLen: html.length }, '[Mail stub] 邮件未发送（未配置 SMTP_HOST）');
    return { ok: true };
  }
  // TODO: nodemailer SMTP 对接（env.SMTP_HOST/PORT/USER/PASS）
  throw new Error('Mail 真实发送未实现（需 nodemailer SMTP 配置）');
}
