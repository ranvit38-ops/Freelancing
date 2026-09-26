-- Uploaded files kept in the database, for hosts with no persistent disk.
-- A free Render service wipes its disk on every restart; the database is the
-- one thing that survives, so on such a host the bytes live here.
create table if not exists file_blobs (
  storage_key text primary key,
  byte_size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
