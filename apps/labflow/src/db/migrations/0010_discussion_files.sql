-- A message can carry a file.
--
-- Files still belong to the run that produced them; this only lets someone
-- point at one from the lab channel without describing it in prose. Deleting
-- the file leaves the message, because the sentence around it usually still
-- means something.
--
-- Safe to re-run.
ALTER TABLE "discussions"
  ADD COLUMN IF NOT EXISTS "file_id" uuid REFERENCES "files"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "discussions_workspace_idx"
  ON "discussions" ("workspace_id", "created_at");
