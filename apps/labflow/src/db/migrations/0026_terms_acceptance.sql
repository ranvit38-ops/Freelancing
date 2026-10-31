-- Which version of the Terms and Privacy statement each person agreed to, and
-- when. Sign-up asks for an explicit tick; this is the record that they gave
-- it. Accounts created before the box existed have nothing recorded.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
