-- When this account proved it controls its email address: by signing in with
-- Google (which verified it), by finishing a password reset (the link went to
-- the inbox), or by joining from an invite emailed to that address.
--
-- Sign-up with a password proves nothing about the address, so until one of
-- those happens the account is unverified. Two things depend on it: only a
-- verified account can be the deployment owner (LABFLOW_OWNER_EMAIL), and a
-- Google sign-in that lands on an unverified account clears its password
-- first, so whoever registered someone else's address cannot keep a way in.
alter table users add column if not exists email_verified_at timestamptz;

-- Accounts created through Google before this column existed: Google had
-- already verified the address, and they have no password to clear.
update users
set email_verified_at = created_at
where email_verified_at is null and password_hash = 'google-oauth-no-password';
