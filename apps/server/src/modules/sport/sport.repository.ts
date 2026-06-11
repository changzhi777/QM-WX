/**
 * sport module data access
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../infra/prisma.js';

export const sportRepo = {
  // ===== checkin =====

  /** 今日是否已打卡（同 userId + date 限一次） */
  findTodayCheckin(userId: string, date: string) {
    return prisma.checkin.findFirst({
      where: { userId, date },
    });
  },

  /** 我的某段时间打卡（按 createdAt 范围） */
  findMyCheckins(userId: string, since: Date) {
    return prisma.checkin.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** 单 group 内的打卡（按 createdAt 范围） */
  findGroupCheckins(groupId: string, since: Date) {
    return prisma.checkin.findMany({
      where: { groupId, createdAt: { gte: since } },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    });
  },

  // ===== group =====

  findGroup(id: string) {
    return prisma.group.findUnique({ where: { id } });
  },

  myGroups(userId: string) {
    return prisma.groupMember.findMany({
      where: { userId },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });
  },

  isMember(groupId: string, userId: string) {
    return prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
  },

  countMyGroups(userId: string) {
    return prisma.groupMember.count({ where: { userId } });
  },

  // ===== 写（事务友好） =====

  async checkinInTx(
    tx: Prisma.TransactionClient,
    data: {
      userId: string;
      groupId: string | null;
      distance: number;
      durationSec: number | null;
      pace: string | null;
      heartRate: number | null;
      cadence: number | null;
      points: number;
      date: string;
    },
  ) {
    return tx.checkin.create({ data });
  },
};

export type SportTx = PrismaClient | Prisma.TransactionClient;
