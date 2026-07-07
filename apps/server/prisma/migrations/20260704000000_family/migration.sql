-- V0.1.34 家庭空间（pic 2776 家庭方向）
-- Family + FamilyMember（一人一家庭）+ Goal.familyId（家庭目标）

CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Family_inviteCode_key" ON "Family"("inviteCode");
CREATE INDEX "Family_ownerId_idx" ON "Family"("ownerId");

CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FamilyMember_userId_key" UNIQUE ("userId")
);

CREATE INDEX "FamilyMember_familyId_idx" ON "FamilyMember"("familyId");

ALTER TABLE "Family" ADD CONSTRAINT "Family_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Goal +familyId（家庭目标，null=个人）
ALTER TABLE "Goal" ADD COLUMN "familyId" TEXT;
CREATE INDEX "Goal_familyId_idx" ON "Goal"("familyId");
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
