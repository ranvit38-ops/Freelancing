-- Workspace invitations. Idempotent.
CREATE TABLE IF NOT EXISTS workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role workspace_role NOT NULL DEFAULT 'member',
  token_hash text NOT NULL,
  invited_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_token_key ON workspace_invites (token_hash);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON workspace_invites (email);
-- One outstanding invite per address per workspace.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_pending_key
  ON workspace_invites (workspace_id, email) WHERE accepted_at IS NULL;
