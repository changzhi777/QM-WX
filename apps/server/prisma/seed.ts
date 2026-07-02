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

const SEED_PRODUCTS = [
  // 装备
  { name: '智能运动手环', category: '运动装备', brand: '青沐', price: 299.0, originalPrice: 399.0, memberDiscount: 0.9, description: '心率监测 + 步数记录 + 50米防水', stock: 100, images: [] },
  { name: '专业马拉松跑鞋', category: '运动装备', brand: '青沐', price: 599.0, originalPrice: 799.0, memberDiscount: 0.85, description: '轻量化设计 + 碳板支撑 + 适合长距离', stock: 50, images: [] },
  // 营养
  { name: '运动蛋白粉（巧克力味）', category: '营养品', brand: '青沐', price: 199.0, memberDiscount: 0.95, description: '乳清蛋白 + 支链氨基酸 + 修复肌肉', stock: 200, images: [] },
  // 服装
  { name: '青沐定制跑步T恤', category: '服装', brand: '青沐', price: 99.0, originalPrice: 129.0, memberDiscount: 0.9, description: '速干面料 + 透气网眼 + 跑团 logo 印花', stock: 300, images: [] },
  // 配件
  { name: '青沐运动水杯', category: '配件', brand: '青沐', price: 49.0, originalPrice: 69.0, memberDiscount: 0.95, description: 'BPA Free + 500ml + 一键开盖', stock: 500, images: [] },
  { name: '青沐跑步帽', category: '配件', brand: '青沐', price: 69.0, originalPrice: 89.0, memberDiscount: 0.9, description: '空顶透气 + 防紫外线 + 轻量', stock: 200, images: [] },
  { name: '青沐压缩腿套', category: '配件', brand: '青沐', price: 89.0, memberDiscount: 0.9, description: '梯度压缩 + 促进血液循环 + 减少乳酸', stock: 150, images: [] },
  { name: '青沐运动毛巾', category: '配件', brand: '青沐', price: 29.0, memberDiscount: 0.95, description: '超细纤维 + 强吸水 + 便携挂环', stock: 400, images: [] },
];

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

  // 商品 seed：按 name 幂等（重复跑只补缺失，不覆盖现有）
  let productInserted = 0;
  for (const p of SEED_PRODUCTS) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.product.create({ data: p });
      productInserted++;
    }
  }
  console.log(`✅ Products seed done（新增 ${productInserted}，定义 ${SEED_PRODUCTS.length}）`);

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
