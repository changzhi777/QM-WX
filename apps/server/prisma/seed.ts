/**
 * Prisma seed — 初始化 AppConfig 记录
 *
 * 跑法：`pnpm prisma:seed`
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_FEATURE_FLAGS = {
  wallet: false,
  payment: false,
  membershipPurchase: false,
  smartAgent: false,
  bindApp: false,
};

const DEFAULT_MEMBER_LEVELS = {
  free: { maxGroups: 2, discount: 1 },
  monthly: { price: 29.9, maxGroups: 5, discount: 0.9, monthlyGiftPoints: 100 },
  quarterly: { price: 79.9, maxGroups: 8, discount: 0.85, monthlyGiftPoints: 100 },
  yearly: { price: 299, maxGroups: 15, discount: 0.8, monthlyGiftPoints: 100 },
};

const DEFAULT_POINTS_RULES = {
  perKm: 1,
  dailyMaxKm: 50,
  dailyMaxCheckins: 1,
  signupBonus: 50,
  memberMonthlyGift: 100,
};

async function main() {
  console.log('🌱 Seeding AppConfig...');

  await prisma.appConfig.upsert({
    where: { id: 'feature_flags' },
    create: { id: 'feature_flags', value: DEFAULT_FEATURE_FLAGS },
    update: {},
  });

  await prisma.appConfig.upsert({
    where: { id: 'member_levels' },
    create: { id: 'member_levels', value: DEFAULT_MEMBER_LEVELS },
    update: {},
  });

  await prisma.appConfig.upsert({
    where: { id: 'points_rules' },
    create: { id: 'points_rules', value: DEFAULT_POINTS_RULES },
    update: {},
  });

  console.log('✅ AppConfig seeded');
  console.log({
    feature_flags: DEFAULT_FEATURE_FLAGS,
    member_levels: DEFAULT_MEMBER_LEVELS,
    points_rules: DEFAULT_POINTS_RULES,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
