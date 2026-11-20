-- A link the whole lab can join with.
--
-- Emailing one invitation per person is how a lab of nine becomes a lab of
-- three: the PI invites the two people in the room and never gets back to it.
-- A join link gets pasted into the group chat once and everyone is in.
--
-- Stored in the clear, unlike an invitation token. An invitation is a secret
-- addressed to one person, so only its hash is kept; a join link is a thing
-- the lab has to be able to read off the screen and paste, which a hash makes
-- impossible. It is a capability, exactly like a video call link: anyone
-- holding it can join, and the way to revoke it is to replace it.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS join_code text;

-- Two workspaces sharing a code would put someone in the wrong lab, so the
-- database refuses it rather than trusting the generator. Partial, because
-- every workspace without a link has NULL here and those do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_join_code_key
  ON workspaces (join_code) WHERE join_code IS NOT NULL;
