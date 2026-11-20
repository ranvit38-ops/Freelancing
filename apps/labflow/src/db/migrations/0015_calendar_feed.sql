-- A private calendar address per person per lab.
--
-- Google Calendar, Apple Calendar and Outlook can all subscribe to a URL and
-- keep it up to date on their own. That gives a lab its meetings and task
-- deadlines in the calendar they already live in, without asking Google to
-- review an app for access to anyone's calendar.
--
-- Stored in the clear for the same reason as the join code: it has to be
-- shown again to be pasted. It reads one lab's calendar and nothing else, and
-- replacing it cuts off every calendar that held the old one.
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS calendar_token text;

CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_calendar_token_key
  ON workspace_members (calendar_token) WHERE calendar_token IS NOT NULL;
