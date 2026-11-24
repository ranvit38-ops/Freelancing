-- Experiments only some people may see: a run under embargo, a collaborator's
-- confidential samples, a student project. Off by default: a lab's record is
-- shared unless someone chooses otherwise. Owners and admins always see
-- everything, since they could grant themselves access anyway.
ALTER TABLE experiments ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS experiment_members (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, user_id)
);
CREATE INDEX IF NOT EXISTS experiment_members_user_idx ON experiment_members (user_id);
