-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedBy" TEXT,
ADD COLUMN     "sendingPaused" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "lastError" TEXT;

-- AlterTable
ALTER TABLE "Suppression" ADD COLUMN     "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: an existing suppression's event happened when the row was created.
-- Without this every old row would look like it was suppressed "just now", and
-- auto-pause reads a rolling window — the whole history would count as today's
-- bounces and pause sending the moment this ships.
UPDATE "Suppression" SET "lastEventAt" = "createdAt";
