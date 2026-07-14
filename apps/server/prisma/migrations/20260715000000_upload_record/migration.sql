-- V0.1.150 UploadRecord 表（COS 中转 + 异步解析留底）

CREATE TABLE "UploadRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cosUrl" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "password" TEXT,
    "parsedResult" JSONB,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadRecord_userId_createdAt_idx" ON "UploadRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadRecord_status_idx" ON "UploadRecord"("status");

-- AddForeignKey
ALTER TABLE "UploadRecord" ADD CONSTRAINT "UploadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
