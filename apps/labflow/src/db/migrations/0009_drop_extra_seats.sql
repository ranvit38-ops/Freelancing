-- Removes the per-person add-on.
--
-- Labvia is priced per lab: each plan covers a fixed number of people, and a
-- lab that outgrows its plan moves up a plan rather than buying seats one at a
-- time. Nothing writes this column any more, and a column nothing writes is a
-- claim the product does not honour, so it goes.
--
-- Safe to re-run, and safe to run against a database that never had the column.
ALTER TABLE "workspace_subscriptions" DROP COLUMN IF EXISTS "extra_seats";
