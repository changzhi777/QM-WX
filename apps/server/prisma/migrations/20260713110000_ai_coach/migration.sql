-- CreateTable（V0.1.139 AI 私教对话多轮记忆）
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- 索引：按用户+会话+时间查最近 N 轮；按会话查全部
CREATE INDEX "ConversationTurn_userId_conversationId_createdAt_idx" ON "ConversationTurn"("userId", "conversationId", "createdAt");
CREATE INDEX "ConversationTurn_conversationId_idx" ON "ConversationTurn"("conversationId");

-- 外键：User 删除级联
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
