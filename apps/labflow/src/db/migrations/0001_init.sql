-- LabFlow initial schema. Idempotent: safe to re-run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner','admin','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('planning','active','on_hold','completed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE experiment_status AS ENUM ('planned','in_progress','completed','repeated','needs_investigation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ai_kind AS ENUM ('experiment_analysis','project_answer','research_memory','research_update');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE research_update_status AS ENUM ('draft','final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_token_hash_key ON password_reset_tokens (token_hash);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  institution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_key ON workspaces (slug);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  research_question text,
  status project_status NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id);
CREATE INDEX IF NOT EXISTS projects_search_idx ON projects (name);

CREATE TABLE IF NOT EXISTS protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protocols_workspace_id_idx ON protocols (workspace_id);

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  storage_key text NOT NULL,
  uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_workspace_id_idx ON files (workspace_id);

CREATE TABLE IF NOT EXISTS protocol_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  version integer NOT NULL,
  change_note text,
  body text,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS protocol_versions_protocol_version_key
  ON protocol_versions (protocol_id, version);

CREATE TABLE IF NOT EXISTS experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number integer NOT NULL,
  title text NOT NULL,
  performed_on timestamptz,
  researcher_id uuid REFERENCES users(id) ON DELETE SET NULL,
  objective text,
  hypothesis text,
  status experiment_status NOT NULL DEFAULT 'planned',
  protocol_version_id uuid REFERENCES protocol_versions(id) ON DELETE SET NULL,
  protocol_notes text,
  repeats_experiment_id uuid REFERENCES experiments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiments_project_id_idx ON experiments (project_id);
CREATE INDEX IF NOT EXISTS experiments_workspace_id_idx ON experiments (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS experiments_project_number_key ON experiments (project_id, number);

CREATE TABLE IF NOT EXISTS experiment_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text NOT NULL,
  unit text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_conditions_experiment_id_idx
  ON experiment_conditions (experiment_id);

CREATE TABLE IF NOT EXISTS samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  parent_sample_id uuid REFERENCES samples(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS samples_workspace_code_key ON samples (workspace_id, code);
CREATE INDEX IF NOT EXISTS samples_project_id_idx ON samples (project_id);

CREATE TABLE IF NOT EXISTS experiment_samples (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, sample_id)
);
CREATE INDEX IF NOT EXISTS experiment_samples_sample_id_idx ON experiment_samples (sample_id);

CREATE TABLE IF NOT EXISTS experiment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  summary text,
  observations text,
  conclusion text,
  next_steps text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS experiment_results_experiment_id_key
  ON experiment_results (experiment_id);

CREATE TABLE IF NOT EXISTS experiment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_notes_experiment_id_idx ON experiment_notes (experiment_id);

CREATE TABLE IF NOT EXISTS experiment_files (
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, file_id)
);

CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_experiment_id_idx ON datasets (experiment_id);

CREATE TABLE IF NOT EXISTS dataset_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_numeric boolean NOT NULL DEFAULT false,
  stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dataset_columns_dataset_id_idx ON dataset_columns (dataset_id);

CREATE TABLE IF NOT EXISTS ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES experiments(id) ON DELETE CASCADE,
  kind ai_kind NOT NULL,
  prompt text,
  output jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_generations_project_id_idx ON ai_generations (project_id);

CREATE TABLE IF NOT EXISTS research_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  status research_update_status NOT NULL DEFAULT 'draft',
  experiment_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_updates_project_id_idx ON research_updates (project_id);
