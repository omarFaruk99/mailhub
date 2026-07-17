-- Mark which templates are system-seeded ready-mades vs the user's own.
ALTER TABLE "Template" ADD COLUMN "isStarter" BOOLEAN NOT NULL DEFAULT false;
