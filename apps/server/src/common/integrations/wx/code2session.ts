/**
 * 微信 code2Session
 *
 * 小程序 wx.login() → code → 后端 → jscode2session → openid + session_key
 *
 * 缓存：session_key 存 Redis（key: `wx:session:{openid}`，TTL 7000s），
 * 后续需要 unionid / 解密手机号时再用。
 */
import { env } from '../../../config/env.js';
import { redis } from '../../../infra/redis.js';
import { Errors } from '../../errors.js';

const CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

interface Code2SessionResp {
  openid: string;
  session_key: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export async function code2Session(code: string): Promise<Code2SessionResp> {
  const url = new URL(CODE2SESSION_URL);
  url.searchParams.set('appid', env.WX_APPID);
  url.searchParams.set('secret', env.WX_SECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const resp = await fetch(url.toString());
  const data = (await resp.json()) as Code2SessionResp;

  if (data.errcode || !data.openid) {
    throw Errors.badRequest(`微信登录失败: ${data.errmsg ?? 'unknown'}`);
  }

  // 缓存 session_key（7 天有效期，跟微信对齐）
  await redis.setex(`wx:session:${data.openid}`, 7000, data.session_key);

  return data;
}
