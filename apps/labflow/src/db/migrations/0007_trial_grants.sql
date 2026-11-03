-- One trial per person, recorded permanently.
--
-- Deliberately separate from users and workspaces: deleting an account must
-- not hand back another trial, which is exactly the loop this closes.
-- Idempotent.
CREATE TABLE IF NOT EXISTS trial_grants (
  email text PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);
