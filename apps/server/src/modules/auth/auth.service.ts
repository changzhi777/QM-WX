/**
 * auth service — 多方式登录（V0.1.129，参考 logto connector 模式）
 *
 * 每种登录方式独立 connector，login 统一 dispatch：
 * - wechat：委托 userService.login（保留 wx.login 全套：openid upsert + 首登积分 + ludong sync + config）
 * - phone/email/password：本 module 实现（verify connector → 找 User → 签 JWT + config）
 *
 * 多方式为「绑定」关系（bindApps）：用户先微信登录，再绑手机号/邮箱/密码，
 * 之后可用绑定的方式登录（同一 User）。不自动注册（身份唯一，openid 为主键）。
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { signTokens } from '../../common/helpers/sign-tokens.js';
import { configRepo } from '../app-config/app-config.repository.js';
import { userService, toUserOutput } from '../user/user.service.js';
import { verifyPhone } from './connectors/phone.js';
import { verifyEmailPassword } from './connectors/email.js';
import { verifyAdminPassword } from './connectors/password.js';

export type LoginMethod = 'wechat' | 'phone' | 'email' | 'password';

export interface LoginInput {
  method: LoginMethod;
  payload: Record<string, unknown>;
}

export const authService = {
  /**
   * 统一登录入口（dispatch by method）
   *
   * wechat 委托 userService.login（兼容小程序现有 user.login action 调用）
   */
  async login(app: FastifyInstance, input: LoginInput) {
    if (input.method === 'wechat') {
      // wechat payload: { code, nickname?, avatarUrl? }（兼容 userService.login 签名）
      return userService.login(app, input.payload as never);
    }
    return this.loginByMethod(app, input.method, input.payload);
  },

  /**
   * 非微信方式登录（phone/email/password）
   *
   * verify connector → 找 User → 签 JWT + config
   * 不自动注册：未注册返 unauthorized（用户需先微信登录 + bindApps 绑定该方式）
   */
  async loginByMethod(
    app: FastifyInstance,
    method: Exclude<LoginMethod, 'wechat'>,
    payload: Record<string, unknown>,
  ) {
    let user: { id: string; openid: string; [k: string]: unknown } | null = null;
    if (method === 'phone') {
      user = await verifyPhone(String(payload.phone ?? ''), String(payload.code ?? ''));
      if (!user) throw Errors.unauthorized('验证码错误或手机号未注册');
    } else if (method === 'email') {
      user = await verifyEmailPassword(String(payload.email ?? ''), String(payload.password ?? ''));
      if (!user) throw Errors.unauthorized('邮箱或密码错误');
    } else if (method === 'password') {
      user = await verifyAdminPassword(
        String(payload.username ?? ''),
        String(payload.password ?? ''),
      );
      if (!user) throw Errors.unauthorized('账号或密码错误');
    } else {
      throw Errors.badRequest(`unsupported method: ${method as string}`);
    }

    const { accessToken, refreshToken } = await signTokens(app, user);
    const config = await configRepo.getLoginConfig();
    return { user: toUserOutput(user as never), accessToken, refreshToken, config };
  },
};
