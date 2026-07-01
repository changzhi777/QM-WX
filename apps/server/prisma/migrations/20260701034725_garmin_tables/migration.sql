-- CreateTable
CREATE TABLE "GarminSleep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarDate" TIMESTAMP(3) NOT NULL,
    "sleepStartGMT" TIMESTAMP(3),
    "sleepEndGMT" TIMESTAMP(3),
    "deepSleepSeconds" INTEGER,
    "lightSleepSeconds" INTEGER,
    "remSleepSeconds" INTEGER,
    "awakeSleepSeconds" INTEGER,
    "unmeasurableSeconds" INTEGER,
    "averageRespiration" DOUBLE PRECISION,
    "lowestRespiration" DOUBLE PRECISION,
    "highestRespiration" DOUBLE PRECISION,
    "awakeCount" INTEGER,
    "avgSleepStress" DOUBLE PRECISION,
    "sleepScores" JSONB,
    "raw" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarminSleep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarminFitnessAge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "chronologicalAge" INTEGER,
    "bmi" DOUBLE PRECISION,
    "rhr" INTEGER,
    "vo2Max" DOUBLE PRECISION,
    "currentBioAge" DOUBLE PRECISION,
    "totalVigorousDays" INTEGER,
    "raw" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarminFitnessAge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarminMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "calendarDate" TIMESTAMP(3),
    "value" DOUBLE PRECISION,
    "level" TEXT,
    "raw" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarminMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GarminSleep_userId_calendarDate_idx" ON "GarminSleep"("userId", "calendarDate");

-- CreateIndex
CREATE UNIQUE INDEX "GarminSleep_userId_calendarDate_key" ON "GarminSleep"("userId", "calendarDate");

-- CreateIndex
CREATE INDEX "GarminFitnessAge_userId_asOfDate_idx" ON "GarminFitnessAge"("userId", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "GarminFitnessAge_userId_asOfDate_key" ON "GarminFitnessAge"("userId", "asOfDate");

-- CreateIndex
CREATE INDEX "GarminMetric_userId_metricType_calendarDate_idx" ON "GarminMetric"("userId", "metricType", "calendarDate");

-- CreateIndex
CREATE UNIQUE INDEX "GarminMetric_userId_metricType_calendarDate_key" ON "GarminMetric"("userId", "metricType", "calendarDate");

-- AddForeignKey
ALTER TABLE "GarminSleep" ADD CONSTRAINT "GarminSleep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarminFitnessAge" ADD CONSTRAINT "GarminFitnessAge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarminMetric" ADD CONSTRAINT "GarminMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
