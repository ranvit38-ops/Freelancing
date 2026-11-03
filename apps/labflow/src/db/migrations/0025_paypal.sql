-- Payments move from Stripe to PayPal Subscriptions.
--
-- The Stripe columns and processed_stripe_events stay in place, unused: every
-- migration re-runs on boot, so dropping them here would only have 0004 add
-- them back. Nothing reads them any more.
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS paypal_subscription_id text;
-- 'month' or 'year': yearly plans get a reminder before they renew.
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS billing_interval text;
-- The last billing notice emailed, as '<subscription id>:<status>', so a
-- confirmation or cancellation is sent once however many events repeat it.
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS notified_state text;
-- The renewal date a reminder was last sent for.
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS renewal_reminder_for timestamptz;

-- PayPal retries webhooks; recording ids makes a replay a no-op.
CREATE TABLE IF NOT EXISTS processed_paypal_events (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
