-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "company" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'client';
