-- V0.2.134 收藏动作（User.favoriteExerciseIds String[] 数组）
-- Postgres 数组：has array contains/overlap 运算符，1 列存全部收藏 ID（轻量；YAGNI 不建单独表）
-- 现有用户：[]（default 显式补齐）

ALTER TABLE "User" ADD COLUMN "favoriteExerciseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
