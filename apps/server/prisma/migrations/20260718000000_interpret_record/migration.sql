-- V0.2.33 interpret module：资料解读记录表（佳明/病历/截图 → minimax M3）
CREATE TABLE "InterpretRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inputKey" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterpretRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterpretRecord_userId_createdAt_idx" ON "InterpretRecord"("userId", "createdAt");
CREATE INDEX "InterpretRecord_type_idx" ON "InterpretRecord"("type");

ALTER TABLE "InterpretRecord" ADD CONSTRAINT "InterpretRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
