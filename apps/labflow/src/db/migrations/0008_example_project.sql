-- Marks the worked example a new workspace starts with.
--
-- It exists so nobody's first minute is an empty screen, and it must not
-- consume the one project the free plan allows, so the flag is what the usage
-- count excludes. Idempotent.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_example boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS projects_example_idx ON projects (workspace_id) WHERE is_example;
