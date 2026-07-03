-- 动态 + 点赞 + 评论（V0.1.30，社交向）
CREATE TABLE "Feed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "checkinId" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Feed_createdAt_idx" ON "Feed"("createdAt");
CREATE INDEX "Feed_userId_createdAt_idx" ON "Feed"("userId", "createdAt");

CREATE TABLE "FeedLike" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedLike_feedId_userId_key" ON "FeedLike"("feedId", "userId");
CREATE INDEX "FeedLike_feedId_idx" ON "FeedLike"("feedId");

CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FeedComment_feedId_createdAt_idx" ON "FeedComment"("feedId", "createdAt");

-- 外键
ALTER TABLE "Feed" ADD CONSTRAINT "Feed_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeedLike" ADD CONSTRAINT "FeedLike_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedLike" ADD CONSTRAINT "FeedLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_feedId_fkey"
    FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
