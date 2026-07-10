-- V0.1.116 评价回复（admin/商家回复用户评价）
ALTER TABLE "Review" ADD COLUMN "replyContent" TEXT;
ALTER TABLE "Review" ADD COLUMN "repliedAt" TIMESTAMP(3);
