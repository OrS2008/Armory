-- Roles inside a crew, and the rules that follow from them.

-- Which seat a person fills: the qualification that names the role (נהג, מפקד,
-- חמ״ל), or NULL for the plain seat the printed sheet calls "לוחם".
ALTER TABLE assignment_personnel
  ADD COLUMN role_qualification_id TEXT REFERENCES qualifications(id) ON DELETE SET NULL;

-- "בכל משימה יכול להיות רק נהג אחד ורק מפקד אחד." A partial unique index makes
-- that the database's job rather than the caller's: a named role can be taken
-- once, while NULL repeats freely — which is exactly what the לוחם seats need.
CREATE UNIQUE INDEX idx_assignment_role_once
  ON assignment_personnel(assignment_id, role_qualification_id)
  WHERE role_qualification_id IS NOT NULL;

-- A qualification that restricts its holder instead of merely permitting them.
-- Whoever is marked חמ״ל does חמ״ל and nothing else.
ALTER TABLE qualifications
  ADD COLUMN exclusive INTEGER NOT NULL DEFAULT 0 CHECK(exclusive IN (0,1));

INSERT INTO scheduling_rules
  (id, org_id, code, name, enabled, severity, overridable, config, created_at, updated_at) VALUES
  ('rule_exclusive','org_default','EXCLUSIVE_QUALIFICATION','הכשיר ייעודי — מחזיקו משובץ רק למשימות שלו',1,'blocking',1,'{}',0,0),
  ('rule_role_qualification','org_default','ROLE_QUALIFICATION','ממלא תפקיד מחזיק בהכשיר של אותו תפקיד',1,'blocking',1,'{}',0,0),
  ('rule_role_once','org_default','ROLE_TAKEN','תפקיד אחד לכל אדם במשימה',1,'blocking',0,'{}',0,0),
  ('rule_pre_departure','org_default','PRE_DEPARTURE_REST','אין שיבוץ בשעות שלפני יציאה',1,'blocking',1,'{"hours":8}',0,0);
