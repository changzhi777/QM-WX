/**
 * 微信小程序全局 access_token（V0.2.65 mp audit API 集成）
 *
 * 公众平台 API（submitAudit 代码提审 / uploadMedia 审核素材 等）需 access_token，
 * 与 code2Session 的 session_key 不同。缓存 Redis 7000s（token TTL 7200s，提前 200s 刷新）。
 *
 * 用法：
 *   import { getMpAccessToken } from './wx-token.js';
 *   const token = await getMpAccessToken();
 *   await fetch(`https://api.weixin.qq.com/wxa/submit_audit?access_token=${token}`, {...});
 */
import { redis } from './redis.js';
import { env } from '../config/env.js';
import { Errors } from '../common/errors.js';

const TOKEN_KEY = 'wx:mp_access_token';
const TTL_SEC = 7000; // 7200s - 200s 提前刷新

/** 获取 mp access_token（Redis 缓存，空/过期则调 cgi-bin/token 刷新）*/
export async function getMpAccessToken(): Promise<string> {
  const cached = await redis.get(TOKEN_KEY);
  if (cached) return cached;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WX_APPID}&secret=${env.WX_SECRET}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!data.access_token) {
    throw Errors.badRequest(
      `微信 access_token 获取失败: errcode=${data.errcode} ${data.errmsg ?? ''}`,
    );
  }
  await redis.set(TOKEN_KEY, data.access_token, 'EX', TTL_SEC);
  return data.access_token;
}

/** 强制刷新（提审失败若 token 失效可手动清）*/
export async function invalidateMpAccessToken(): Promise<void> {
  await redis.del(TOKEN_KEY);
}
