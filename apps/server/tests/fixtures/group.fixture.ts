/**
 * Group / GroupMember / Checkin fixture
 */

export interface GroupFixture {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function makeGroup(overrides: Partial<GroupFixture> = {}): GroupFixture {
  return {
    id: 'group-1',
    name: '测试跑团',
    description: null,
    ownerId: 'user-1',
    memberCount: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface GroupMemberFixture {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: Date;
}

export function makeGroupMember(overrides: Partial<GroupMemberFixture> = {}): GroupMemberFixture {
  return {
    id: 'gm-1',
    groupId: 'group-1',
    userId: 'user-1',
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface CheckinFixture {
  id: string;
  userId: string;
  groupId: string | null;
  date: Date;
  distance: number;
  duration: number;
  pace: number | null;
  points: number;
  source: 'manual' | 'werun' | 'keep' | 'codoon';
  proof: string | null;
  createdAt: Date;
}

export function makeCheckin(overrides: Partial<CheckinFixture> = {}): CheckinFixture {
  return {
    id: 'checkin-1',
    userId: 'user-1',
    groupId: 'group-1',
    date: new Date('2026-01-02T00:00:00Z'),
    distance: 5,
    duration: 1800, // 30 分钟
    pace: 360,
    points: 10,
    source: 'manual',
    proof: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}
