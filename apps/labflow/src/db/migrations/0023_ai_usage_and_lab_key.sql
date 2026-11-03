-- Every AI request a lab makes, so the monthly allowance counts all of them:
-- LabBot, analyses, filling a run from a description, catch-up briefings and
-- document revisions. ai_generations keeps the answers worth keeping; this
-- only counts. Requests made with the lab's own key are counted too, marked,
-- but never limited.
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  own_key boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_workspace_created_idx ON ai_usage (workspace_id, created_at DESC);

-- This month's answers already counted under the old rule keep counting, once.
INSERT INTO ai_usage (workspace_id, user_id, feature, created_at)
SELECT workspace_id, created_by_id, kind::text, created_at
FROM ai_generations
WHERE created_at >= date_trunc('month', now())
  AND NOT EXISTS (SELECT 1 FROM ai_usage);

-- A lab's own Anthropic API key, encrypted with LABFLOW_ENCRYPTION_KEY
-- (AES-256-GCM). The hint is the last four characters, so people can tell
-- which key is in use without it ever being shown back.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS anthropic_key_enc text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS anthropic_key_hint text;
