-- V0.1.36 2771 社交深化（话题 + 视频）
-- Feed +topic（话题聚合）+ videoUrl（外部视频链接）

ALTER TABLE "Feed" ADD COLUMN "topic" TEXT;
ALTER TABLE "Feed" ADD COLUMN "videoUrl" TEXT;

CREATE INDEX "Feed_topic_idx" ON "Feed"("topic");
