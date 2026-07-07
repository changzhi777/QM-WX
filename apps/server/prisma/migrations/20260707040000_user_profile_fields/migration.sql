-- V0.1.40 User 个人资料扩展（gender/birthday/region/height/weight）
ALTER TABLE "User" ADD COLUMN "gender" TEXT;
ALTER TABLE "User" ADD COLUMN "birthday" TEXT;
ALTER TABLE "User" ADD COLUMN "region" TEXT;
ALTER TABLE "User" ADD COLUMN "height" INTEGER;
ALTER TABLE "User" ADD COLUMN "weight" DOUBLE PRECISION;
