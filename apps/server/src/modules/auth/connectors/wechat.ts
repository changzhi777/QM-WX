/**
 * 微信小程序登录 connector（V0.1.129）
 *
 * wx.login code → code2Session → openid + unionid（小程序原生，不走 OIDC redirect）
 */
import { code2Session } from '../../../common/integrations/wx/code2session.js';

export async function verifyWechat(
  code: string,
): Promise<{ openid: string; unionid?: string }> {
  const { openid, unionid } = await code2Session(code);
  return { openid, unionid };
}
