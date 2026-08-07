PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO departments(id,name,created_at,updated_at) VALUES
  ('p1','מחלקה 1',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('p2','מחלקה 2',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('p3','מחלקה 3',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('mplag','מפל״ג',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('attached','מסופחים',unixepoch('now') * 1000,unixepoch('now') * 1000);

INSERT OR IGNORE INTO equipment_items(id,sku,name,unit,created_at,updated_at) VALUES
  ('helmet','HELMET','קסדה','יחידה',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('vest','VEST','ווסט','יחידה',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('mitznefet','MITZNEFET','מצנפת','יחידה',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('knee','KNEE','ברכיות','זוג',unixepoch('now') * 1000,unixepoch('now') * 1000),
  ('mags','MAGS','מחסניות','יחידה',unixepoch('now') * 1000,unixepoch('now') * 1000);

CREATE TABLE equipment_signatures (
  id TEXT PRIMARY KEY,
  soldier_id TEXT NOT NULL REFERENCES soldiers(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','archived')),
  weapon_serial TEXT,
  amral_serial TEXT,
  scope_serial TEXT,
  soldier_note TEXT,
  consent_text TEXT NOT NULL,
  signed_at INTEGER NOT NULL,
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_signatures_status ON equipment_signatures(status,created_at DESC);
CREATE INDEX idx_signatures_soldier ON equipment_signatures(soldier_id,created_at DESC);

CREATE TABLE equipment_signature_lines (
  id TEXT PRIMARY KEY,
  signature_id TEXT NOT NULL REFERENCES equipment_signatures(id) ON DELETE CASCADE,
  equipment_item_id TEXT NOT NULL REFERENCES equipment_items(id),
  issued_quantity INTEGER NOT NULL CHECK(issued_quantity > 0),
  returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK(returned_quantity >= 0 AND returned_quantity <= issued_quantity),
  updated_at INTEGER NOT NULL,
  UNIQUE(signature_id,equipment_item_id)
);

CREATE TABLE weapon_deposits (
  id TEXT PRIMARY KEY,
  soldier_id TEXT NOT NULL REFERENCES soldiers(id),
  weapon_serial TEXT NOT NULL,
  amral_serial TEXT,
  scope_serial TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','returned','rejected')),
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  returned_by TEXT REFERENCES users(id),
  returned_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_weapon_deposits_status ON weapon_deposits(status,created_at DESC);
CREATE UNIQUE INDEX idx_weapon_deposit_active_serial ON weapon_deposits(weapon_serial) WHERE status IN ('pending','approved');

CREATE TABLE building_faults (
  id TEXT PRIMARY KEY,
  reporter_name TEXT NOT NULL,
  personal_id TEXT,
  phone TEXT NOT NULL,
  department TEXT,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
  handled_by TEXT REFERENCES users(id),
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_building_faults_status ON building_faults(status,created_at DESC);

ALTER TABLE equipment_signatures ADD COLUMN signature_object_key TEXT;
ALTER TABLE licenses ADD COLUMN document_object_key TEXT;
ALTER TABLE licenses ADD COLUMN document_name TEXT;
ALTER TABLE licenses ADD COLUMN document_type TEXT;
ALTER TABLE licenses ADD COLUMN document_size INTEGER;

CREATE TABLE fuel_cards (
  id TEXT PRIMARY KEY,
  card_number TEXT NOT NULL UNIQUE,
  fuel_type TEXT NOT NULL CHECK(fuel_type IN ('diesel','gasoline','other')),
  holder TEXT NOT NULL DEFAULT 'משרד רכב',
  litres_balance REAL NOT NULL DEFAULT 0 CHECK(litres_balance >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','credited','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE refuel_reports (
  id TEXT PRIMARY KEY,
  reporter_name TEXT NOT NULL,
  personal_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT,
  vehicle_number TEXT NOT NULL,
  card_number TEXT NOT NULL,
  litres REAL NOT NULL CHECK(litres > 0),
  odometer INTEGER,
  note TEXT,
  receipt_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  handled_by TEXT REFERENCES users(id),
  handled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_refuel_reports_status ON refuel_reports(status,created_at DESC);

CREATE TABLE equipment_loans (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES operational_assets(id),
  borrower_name TEXT NOT NULL,
  borrower_personal_id TEXT,
  destination TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','returned')),
  issued_by TEXT NOT NULL REFERENCES users(id),
  returned_by TEXT REFERENCES users(id),
  issued_at INTEGER NOT NULL,
  returned_at INTEGER
);
CREATE INDEX idx_equipment_loans_status ON equipment_loans(status,issued_at DESC);
