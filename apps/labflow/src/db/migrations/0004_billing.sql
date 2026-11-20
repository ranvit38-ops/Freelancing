-- Seat-based subscriptions, one per workspace. Idempotent.
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trialing','active','past_due','canceled','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan text,
  status subscription_status NOT NULL DEFAULT 'trialing',
  extra_seats integer NOT NULL DEFAULT 0,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One subscription per workspace, and one workspace per Stripe subscription.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_subscriptions_workspace_key
  ON workspace_subscriptions (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_subscriptions_stripe_sub_key
  ON workspace_subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS workspace_subscriptions_customer_idx
  ON workspace_subscriptions (stripe_customer_id);

-- Every existing workspace starts on a trial rather than being locked out.
INSERT INTO workspace_subscriptions (workspace_id, status, trial_ends_at)
SELECT w.id, 'trialing', now() + interval '14 days'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_subscriptions s WHERE s.workspace_id = w.id
);

-- Stripe may deliver the same event more than once; this makes replays no-ops.
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
