-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "sendOptions" JSONB,
ADD COLUMN     "timezone" TEXT;
