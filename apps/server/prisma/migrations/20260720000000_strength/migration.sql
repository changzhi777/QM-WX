-- V0.2.42 strength module（力量训练记录，训记式）
-- 3 表：StrengthSession（训练）/ StrengthSet（组明细）/ Exercise（动作库）

CREATE TABLE "StrengthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateStr" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "totalVolume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrengthSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrengthSession_userId_createdAt_idx" ON "StrengthSession"("userId", "createdAt");
CREATE INDEX "StrengthSession_dateStr_idx" ON "StrengthSession"("dateStr");
ALTER TABLE "StrengthSession" ADD CONSTRAINT "StrengthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "muscleGroup" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Exercise_name_key" UNIQUE ("name")
);
CREATE INDEX "Exercise_category_idx" ON "Exercise"("category");

CREATE TABLE "StrengthSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "exerciseId" TEXT,
    "reps" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "restSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrengthSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StrengthSet_sessionId_idx" ON "StrengthSet"("sessionId");
CREATE INDEX "StrengthSet_exerciseId_idx" ON "StrengthSet"("exerciseId");
ALTER TABLE "StrengthSet" ADD CONSTRAINT "StrengthSet_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "StrengthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StrengthSet" ADD CONSTRAINT "StrengthSet_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exercise 预置 seed（~15 基础动作 + 肌群分类）
INSERT INTO "Exercise" ("id","name","category","muscleGroup","isCustom","createdAt") VALUES
 (gen_random_uuid(),'杠铃深蹲','腿','股四头肌',false,NOW()),
 (gen_random_uuid(),'杠铃卧推','胸','胸大肌',false,NOW()),
 (gen_random_uuid(),'传统硬拉','背','竖脊肌',false,NOW()),
 (gen_random_uuid(),'引体向上','背','背阔肌',false,NOW()),
 (gen_random_uuid(),'杠铃推举','肩','三角肌前束',false,NOW()),
 (gen_random_uuid(),'杠铃划船','背','背阔肌',false,NOW()),
 (gen_random_uuid(),'箭步蹲','腿','股四头肌',false,NOW()),
 (gen_random_uuid(),'罗马尼亚硬拉','腿','腘绳肌',false,NOW()),
 (gen_random_uuid(),'哑铃飞鸟','胸','胸大肌',false,NOW()),
 (gen_random_uuid(),'高位下拉','背','背阔肌',false,NOW()),
 (gen_random_uuid(),'哑铃侧平举','肩','三角肌中束',false,NOW()),
 (gen_random_uuid(),'杠铃二头弯举','手臂','肱二头肌',false,NOW()),
 (gen_random_uuid(),'绳索三头下压','手臂','肱三头肌',false,NOW()),
 (gen_random_uuid(),'平板支撑','核心','腹直肌',false,NOW()),
 (gen_random_uuid(),'卷腹','核心','腹直肌',false,NOW());
