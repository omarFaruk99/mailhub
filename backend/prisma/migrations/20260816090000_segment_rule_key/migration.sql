-- Segment.ruleKey: the audience rule normalised into one comparable string, so
-- "one rule per brand" is a database guarantee instead of a check in the route
-- that two concurrent requests can both pass.
--
-- Written by hand rather than generated, because the column is required and the
-- table already has rows: add it nullable, fill it from the existing rule, then
-- lock it down.

-- 1) Add it nullable so existing rows survive.
ALTER TABLE "Segment" ADD COLUMN "ruleKey" TEXT;

-- 2) Backfill. This MUST produce the same string as `ruleKey()` in
--    src/routes/segments.ts: the types sorted and comma-joined, then plan,
--    country and company lower-cased, all joined with "|". Values are already
--    trimmed on write, so no trim is needed here.
UPDATE "Segment" SET "ruleKey" =
  array_to_string(ARRAY(SELECT unnest("includeTypes") ORDER BY 1), ',')
  || '|' || lower(coalesce("plan", ''))
  || '|' || lower(coalesce("country", ''))
  || '|' || lower(coalesce("company", ''));

-- 3) Now that every row has one, require it.
ALTER TABLE "Segment" ALTER COLUMN "ruleKey" SET NOT NULL;

-- 4) The point of the whole column.
CREATE UNIQUE INDEX "Segment_brandId_ruleKey_key" ON "Segment"("brandId", "ruleKey");
