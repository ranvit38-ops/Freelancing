-- Link attachments and threaded discussion. Idempotent.

-- Files now cover both uploads and external links (Drive, Dropbox, any URL).
ALTER TABLE files ALTER COLUMN storage_key DROP NOT NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS provider text;

CREATE TABLE IF NOT EXISTS discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES experiments(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES discussions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discussions_experiment_idx ON discussions (experiment_id, created_at);
CREATE INDEX IF NOT EXISTS discussions_project_idx ON discussions (project_id, created_at);
CREATE INDEX IF NOT EXISTS discussions_parent_idx ON discussions (parent_id);

-- Literature references pinned to a project by a researcher.
CREATE TABLE IF NOT EXISTS literature_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pmid text NOT NULL,
  title text NOT NULL,
  journal text,
  year text,
  authors text,
  note text,
  added_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS literature_refs_project_pmid_key
  ON literature_refs (project_id, pmid);
