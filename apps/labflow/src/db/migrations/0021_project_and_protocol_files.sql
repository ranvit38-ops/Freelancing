-- A lab keeps a folder per project (raw data, code, pictures, metadata) and a
-- folder per protocol (the Word and PDF, photos of the steps, instrument
-- settings, the manual, blank recording tables). Files already live in the
-- files table; these link them to the project or protocol they belong to.
create table if not exists project_files (
  project_id uuid not null references projects(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  -- Free text, because every project is organised differently.
  folder text,
  created_at timestamptz not null default now(),
  primary key (project_id, file_id)
);
create index if not exists project_files_file_id_idx on project_files(file_id);

create table if not exists protocol_files (
  protocol_id uuid not null references protocols(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (protocol_id, file_id)
);
create index if not exists protocol_files_file_id_idx on protocol_files(file_id);
