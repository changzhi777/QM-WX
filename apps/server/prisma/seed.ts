/**
 * Prisma seed — 初始化 AppConfig 记录
 *
 * 跑法：`pnpm prisma:seed`
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

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

// V0.1.41 训练计划模板（替 training.service 原硬编码常量；按 key 幂等）
// V0.2.128 +kind=running|strength（默认 running；新增 2 个 strength 力量训练计划）
const SEED_TRAINING_PLANS = [
  { key: '5k', name: '5公里入门', weeks: 8, level: 'beginner', goal: '完成 5 公里', desc: '从跑走结合到连续跑完 5 公里，适合零基础跑者', weeklyMileage: '8-15 km/周', targetKm: 80, kind: 'running' },
  { key: '10k', name: '10公里进阶', weeks: 10, level: 'intermediate', goal: '完赛 10 公里', desc: '提升耐力与配速，掌握节奏跑与间歇训练', weeklyMileage: '15-25 km/周', targetKm: 200, kind: 'running' },
  { key: 'half', name: '半程马拉松 21K', weeks: 12, level: 'challenge', goal: '完赛半马 21.0975 km', desc: '系统训练长距离，挑战半马完赛', weeklyMileage: '25-40 km/周', targetKm: 400, kind: 'running' },
  { key: 'full', name: '全程马拉松 42K', weeks: 16, level: 'extreme', goal: '完赛全马 42.195 km', desc: '科学备战全马，含 LSD + tempo + recovery', weeklyMileage: '40-60 km/周', targetKm: 800, kind: 'running' },
  // V0.2.128 力量训练计划 + V0.2.129 targetSessions（weeks × 每周场次）
  { key: 'strength_beginner', name: '力量入门 12 周', weeks: 12, level: 'beginner', goal: '塑形入门', desc: '全身基础动作 3×10，卧推/深蹲/硬拉/划船循环，每周 3 次', weeklyMileage: '3 次/周', targetKm: 0, kind: 'strength', targetSessions: 12 * 3 },
  { key: 'strength_intermediate', name: '力量进阶 16 周', weeks: 16, level: 'intermediate', goal: '增肌强化', desc: '分化训练（胸/背/腿/肩手臂），5×5 复合动作 + 3×12 孤立动作', weeklyMileage: '4 次/周', targetKm: 0, kind: 'strength', targetSessions: 16 * 4 },
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

  // 训练计划 seed：按 key 幂等（只补缺失，不覆盖 admin 改动 — 同商品范式）
  // V0.2.128 老计划无 kind 字段，迁移后 schema 默认 'running'；seed 只补缺失（含新 strength 计划）
  let planInserted = 0;
  for (const p of SEED_TRAINING_PLANS) {
    const exists = await prisma.trainingPlan.findUnique({ where: { key: p.key } });
    if (!exists) {
      await prisma.trainingPlan.create({ data: p });
      planInserted++;
    }
  }
  console.log(`✅ TrainingPlans seed done（新增 ${planInserted}，定义 ${SEED_TRAINING_PLANS.length}）`);

  // V0.2.8 admin 账号 seed（root super-admin + admin admin，env 密码 bcrypt；upsert 幂等不覆盖改密）
  const rootPwd = process.env.ADMIN_ROOT_PWD;
  const adminPwd = process.env.ADMIN_ADMIN_PWD;
  if (rootPwd && adminPwd) {
    await prisma.admin.upsert({
      where: { username: 'root' },
      create: {
        username: 'root',
        passwordHash: await bcrypt.hash(rootPwd, 10),
        role: 'super-admin',
        nickname: '超级管理员',
      },
      update: {},
    });
    await prisma.admin.upsert({
      where: { username: 'admin' },
      create: {
        username: 'admin',
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: 'admin',
        nickname: '运营管理员',
      },
      update: {},
    });
    console.log('✅ Admin seed done（root super-admin + admin admin）');
  } else {
    console.log('⚠️ Admin seed 跳过（ADMIN_ROOT_PWD/ADMIN_ADMIN_PWD env 未设）');
  }

  // V0.2.141 动作库 seed：3 个示例动作 + videoUrl 占位（实际视频 URL 后续可换）
  const SEED_EXERCISES = [
    { key: 'squat',     name: '深蹲',       category: '腿',   muscleGroup: '股四头肌', videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
    { key: 'bench',     name: '卧推',       category: '胸',   muscleGroup: '胸大肌',   videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
    { key: 'deadlift',  name: '硬拉',       category: '背',   muscleGroup: '竖脊肌',   videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
  ];
  let exerciseInserted = 0;
  for (const e of SEED_EXERCISES) {
    const exists = await prisma.exercise.findFirst({ where: { name: e.name, userId: null } });
    if (!exists) {
      // V0.2.141 引入 videoUrl 字段（seed 阶段老字段保留；V0.2.132 改 userId:null 表示全局）
      await prisma.exercise.create({
        data: {
          name: e.name,
          category: e.category,
          muscleGroup: e.muscleGroup,
          videoUrl: e.videoUrl,
          isCustom: false,
          userId: null,
        },
      });
      exerciseInserted++;
    }
  }
  console.log(`✅ Exercises seed done（新增 ${exerciseInserted}，定义 ${SEED_EXERCISES.length}）`);

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
