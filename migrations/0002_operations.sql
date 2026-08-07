PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '["*"]';
ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL CHECK(action_type IN ('details','weapon','equipment','shortage','deposit','refuel','fault')),
  personal_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','approved','resolved','rejected','archived')),
  handled_by TEXT REFERENCES users(id),
  handled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_submissions_type_status ON submissions(action_type,status,created_at DESC);
CREATE INDEX idx_submissions_personal_id ON submissions(personal_id,created_at DESC);

CREATE TABLE operational_assets (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK(module IN ('inventory','armory','communications','ammunition','vehicles','fuel_cards')),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  serial_number TEXT,
  owner_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0),
  issued_quantity INTEGER NOT NULL DEFAULT 0 CHECK(issued_quantity >= 0),
  location TEXT NOT NULL DEFAULT 'storage',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','maintenance','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_assets_module_status ON operational_assets(module,status,name);
CREATE UNIQUE INDEX idx_assets_serial ON operational_assets(module,serial_number) WHERE serial_number IS NOT NULL;

CREATE TABLE asset_loans (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES operational_assets(id),
  destination_type TEXT NOT NULL CHECK(destination_type IN ('soldier','mission','vehicle')),
  destination TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','returned')),
  issued_by TEXT REFERENCES users(id),
  returned_by TEXT REFERENCES users(id),
  issued_at INTEGER NOT NULL,
  returned_at INTEGER,
  note TEXT
);
CREATE INDEX idx_loans_status ON asset_loans(status,issued_at DESC);

CREATE TABLE module_notes (
  module TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);

CREATE TABLE deleted_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  deleted_by TEXT REFERENCES users(id),
  deleted_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL
);
CREATE INDEX idx_deleted_purge ON deleted_records(purge_after);
