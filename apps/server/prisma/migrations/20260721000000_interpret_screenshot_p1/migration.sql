-- V0.2.60 interpret screenshot P1 加固
-- InterpretRecord +extract（识别数据供确认查回）+ +checkinConfirmedAt（防重复确认打卡）

ALTER TABLE "InterpretRecord" ADD COLUMN "extract" JSONB;
ALTER TABLE "InterpretRecord" ADD COLUMN "checkinConfirmedAt" TIMESTAMP(3);
