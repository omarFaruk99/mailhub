-- Simplify Template: drop fill-in-fields columns, add default send category.
ALTER TABLE "Template" DROP COLUMN "fields";
ALTER TABLE "Template" DROP COLUMN "layoutKey";
ALTER TABLE "Template" ADD COLUMN "category" TEXT NOT NULL DEFAULT '';
