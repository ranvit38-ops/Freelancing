-- Reagent and consumable inventory, and the lots each experiment consumed.
-- Idempotent: safe to re-run.

-- What the lab keeps on the shelf. One row per item, not per lot.
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  supplier text,
  catalog_number text,
  unit text NOT NULL DEFAULT 'unit',
  reorder_at numeric(12, 3),
  storage text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_items_workspace_idx
  ON inventory_items (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_catalog_key
  ON inventory_items (workspace_id, supplier, catalog_number)
  WHERE catalog_number IS NOT NULL AND supplier IS NOT NULL;

-- A specific lot of an item. Traceability lives here: two lots of the same
-- antibody are not the same reagent, and that is usually why a run stops
-- reproducing.
CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_code text NOT NULL,
  quantity numeric(12, 3) NOT NULL DEFAULT 0,
  received_on date,
  expires_on date,
  opened_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_lots_item_idx ON inventory_lots (item_id);
CREATE INDEX IF NOT EXISTS inventory_lots_workspace_idx ON inventory_lots (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_lots_code_key
  ON inventory_lots (item_id, lot_code);

-- Which lot went into which run, and how much of it.
CREATE TABLE IF NOT EXISTS experiment_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  quantity numeric(12, 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiment_lots_experiment_idx
  ON experiment_lots (experiment_id);
CREATE INDEX IF NOT EXISTS experiment_lots_lot_idx ON experiment_lots (lot_id);
CREATE UNIQUE INDEX IF NOT EXISTS experiment_lots_pair_key
  ON experiment_lots (experiment_id, lot_id);
