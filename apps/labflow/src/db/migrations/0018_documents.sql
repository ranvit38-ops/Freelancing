-- Documents written and edited inside Labvia. Stored as ordinary files, so
-- sharing, direct messages, search, LabBot and the reading path all see them
-- with no special case; these columns say a file is an editable document and
-- who last changed it.
alter table files add column if not exists is_document boolean not null default false;
alter table files add column if not exists updated_at timestamptz;
alter table files add column if not exists updated_by_id uuid references users(id) on delete set null;
