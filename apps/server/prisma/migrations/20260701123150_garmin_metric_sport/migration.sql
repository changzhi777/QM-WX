-- DropIndex
DROP INDEX "GarminMetric_userId_metricType_calendarDate_key";

-- AlterTable
ALTER TABLE "GarminMetric" ADD COLUMN "sport" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GarminMetric_userId_metricType_sport_calendarDate_key" ON "GarminMetric"("userId", "metricType", "sport", "calendarDate");
