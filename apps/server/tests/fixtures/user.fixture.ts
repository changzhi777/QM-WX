/**
 * User fixture — 测试用户标准制造器
 *
 * 用法：
 * ```ts
 * import { makeUser, makeUserOutput } from '../../fixtures/user.fixture.js';
 *
 * const u = makeUser({ points: 500 });
 * ```
 */

export interface UserFixture {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  gender: number | null;
  phone: string | null;
  birthday: Date | null;
  region: string | null;
  height: number | null;
  weight: number | null;
  points: number;
  memberLevel: string;
  memberExpireAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 默认 user — 普通会员，500 积分 */
export function makeUser(overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    id: 'user-1',
    openid: 'oXXXXXX_test_user_1',
    unionid: null,
    nickname: '测试用户',
    avatarUrl: null,
    gender: 0,
    phone: null,
    birthday: null,
    region: null,
    height: null,
    weight: null,
    points: 500,
    memberLevel: 'normal',
    memberExpireAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** toUserOutput 后的结构（service 层返回给前端） */
export function makeUserOutput(overrides: Partial<UserFixture> = {}) {
  const u = makeUser(overrides);
  return {
    id: u.id,
    openid: u.openid,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    gender: u.gender,
    phone: u.phone,
    birthday: u.birthday?.toISOString() ?? null,
    region: u.region,
    height: u.height,
    weight: u.weight,
    points: u.points,
    memberLevel: u.memberLevel,
    memberExpireAt: u.memberExpireAt?.toISOString() ?? null,
  };
}
