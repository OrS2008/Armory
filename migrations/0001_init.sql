-- SHABATZAK — initial schema.
-- All timestamps are epoch milliseconds in UTC. The organisation row carries the
-- display timezone (default Asia/Jerusalem); no local time is ever stored.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity --
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system_admin','company_commander','unit_scheduler','soldier','viewer')),
  personnel_id TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enabled IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL,
  PRIMARY KEY (user_id, unit_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  client_label TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

-- ------------------------------------------------------------ organisation --
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
  week_start_day INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE units (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'team' CHECK(kind IN ('company','platoon','team')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_units_parent ON units(parent_id);
CREATE INDEX idx_units_org ON units(org_id);

CREATE TABLE personnel (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  external_id TEXT,
  display_name TEXT NOT NULL,
  role_title TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  notes TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, external_id)
);
CREATE INDEX idx_personnel_unit ON personnel(unit_id);
CREATE INDEX idx_personnel_status ON personnel(status);

CREATE TABLE qualifications (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, code)
);

CREATE TABLE personnel_qualifications (
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  qualification_id TEXT NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER,
  PRIMARY KEY (personnel_id, qualification_id)
);

-- --------------------------------------------------------------- schedules --
CREATE TABLE availability (
  id TEXT PRIMARY KEY,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('available','leave','training','medical','home','other')),
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
  reason TEXT,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (end_at > start_at)
);
CREATE INDEX idx_availability_person ON availability(personnel_id, start_at, end_at);
CREATE INDEX idx_availability_status ON availability(status);

CREATE TABLE assignment_types (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  default_duration_minutes INTEGER NOT NULL DEFAULT 480 CHECK(default_duration_minutes > 0),
  required_headcount INTEGER NOT NULL DEFAULT 1 CHECK(required_headcount >= 0),
  priority INTEGER NOT NULL DEFAULT 2,
  color TEXT NOT NULL DEFAULT 'slate',
  instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, name)
);

CREATE TABLE assignment_type_qualifications (
  assignment_type_id TEXT NOT NULL REFERENCES assignment_types(id) ON DELETE CASCADE,
  qualification_id TEXT NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_type_id, qualification_id)
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','published','archived')),
  version INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_schedules_range ON schedules(org_id, start_date, end_date);

CREATE TABLE schedule_versions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(schedule_id, version)
);

CREATE TABLE assignment_instances (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
  assignment_type_id TEXT NOT NULL REFERENCES assignment_types(id),
  unit_id TEXT REFERENCES units(id) ON DELETE SET NULL,
  title TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  required_headcount INTEGER NOT NULL CHECK(required_headcount >= 0),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','cancelled')),
  publication_state TEXT NOT NULL DEFAULT 'draft' CHECK(publication_state IN ('draft','published','modified')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (end_at > start_at)
);
CREATE INDEX idx_assignments_window ON assignment_instances(org_id, start_at, end_at);
CREATE INDEX idx_assignments_schedule ON assignment_instances(schedule_id);
CREATE INDEX idx_assignments_unit ON assignment_instances(unit_id);

CREATE TABLE assignment_personnel (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment_instances(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  override_reason TEXT,
  UNIQUE(assignment_id, personnel_id)
);
CREATE INDEX idx_assignment_personnel_person ON assignment_personnel(personnel_id);

CREATE TABLE scheduling_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','blocking')),
  overridable INTEGER NOT NULL DEFAULT 1 CHECK(overridable IN (0,1)),
  config TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(org_id, code)
);

CREATE TABLE replacement_requests (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment_instances(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  replacement_personnel_id TEXT REFERENCES personnel(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','proposed','approved','rejected','cancelled')),
  reason TEXT,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_replacements_status ON replacement_requests(status, created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);

-- ------------------------------------------------------------------- audit --
-- Deliberately no foreign key to users: an audit row must outlive the account
-- that produced it, and the append-only triggers below forbid the UPDATE that a
-- cascading SET NULL would need.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX idx_audit_created ON audit_events(created_at);

-- Audit rows are append-only: the application has no update or delete path and
-- the database refuses one even if a future code path tries.
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;

-- --------------------------------------------------------- baseline config --
INSERT INTO organizations (id, name, timezone, week_start_day, created_at, updated_at)
VALUES ('org_default', 'הפלוגה', 'Asia/Jerusalem', 0, 0, 0);

INSERT INTO scheduling_rules (id, org_id, code, name, enabled, severity, overridable, config, created_at, updated_at) VALUES
  ('rule_no_overlap','org_default','NO_OVERLAP','אין חפיפה בין שיבוצים',1,'blocking',1,'{}',0,0),
  ('rule_availability','org_default','AVAILABILITY_REQUIRED','שיבוץ רק כאשר האדם זמין',1,'blocking',1,'{}',0,0),
  ('rule_qualification','org_default','QUALIFICATION_REQUIRED','נדרשים הכשירים למשימה',1,'blocking',1,'{}',0,0),
  ('rule_min_rest','org_default','MIN_REST','מנוחה מזערית בין שיבוצים',1,'warning',1,'{"minutes":480}',0,0),
  ('rule_max_continuous','org_default','MAX_CONTINUOUS','משך שיבוץ רצוף מרבי',1,'warning',1,'{"minutes":720}',0,0),
  ('rule_max_per_day','org_default','MAX_ASSIGNMENTS_PER_DAY','מספר שיבוצים מרבי ביום',1,'warning',1,'{"count":2}',0,0),
  ('rule_max_hours','org_default','MAX_HOURS_IN_WINDOW','שעות מרביות בחלון זמן',1,'warning',1,'{"hours":60,"windowDays":7}',0,0),
  ('rule_understaffed','org_default','UNDERSTAFFED','משימה בתת־איוש',1,'warning',1,'{}',0,0),
  ('rule_overstaffed','org_default','OVERSTAFFED','משימה מאוישת מעבר לנדרש',1,'info',1,'{}',0,0),
  ('rule_unpublished','org_default','UNPUBLISHED_CHANGES','שינויים שטרם פורסמו',1,'info',1,'{}',0,0);
