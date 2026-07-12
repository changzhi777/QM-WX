-- V0.1.130 COROS Terra webhook 聚合（CorosRawEvent 表）

CREATE TABLE "CorosRawEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "terraUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorosRawEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorosRawEvent_userId_type_receivedAt_idx" ON "CorosRawEvent"("userId", "type", "receivedAt");

CREATE INDEX "CorosRawEvent_terraUserId_idx" ON "CorosRawEvent"("terraUserId");

ALTER TABLE "CorosRawEvent" ADD CONSTRAINT "CorosRawEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
