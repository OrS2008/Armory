-- A post stood by fixed crews.
--
-- חפ״ק is not four seats filled from the roster: it is two rotations of four
-- who go on together, and a shift is one whole rotation. That is not
-- expressible as a qualification — "these four, together" is a fact about the
-- group rather than about any of them — so the group is a row.
--
-- A post with no crews behaves exactly as before. Defining crews on one
-- narrows it to their members and forbids mixing them.
--
-- Written to be safe to run twice: the first attempt against production failed
-- on the last statement, and a migration that half-applied must not fail a
-- second time on the half that succeeded.
CREATE TABLE IF NOT EXISTS assignment_type_crews (
  id TEXT PRIMARY KEY,
  assignment_type_id TEXT NOT NULL REFERENCES assignment_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Where it sits in the rotation, so auto-fill can alternate them in the
  -- order the unit says them out loud: סבב א׳, then סבב ב׳.
  position INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_name ON assignment_type_crews(assignment_type_id, name);
CREATE INDEX IF NOT EXISTS idx_crew_post ON assignment_type_crews(assignment_type_id, position);

-- The seat a member fills in their crew. It is the same qualification the post
-- requires, so the sheet keeps printing מפקד and נהג from one place; storing it
-- here says which of the crew's four takes which, which is what lets a whole
-- rotation be laid on a shift in one act.
CREATE TABLE IF NOT EXISTS assignment_type_crew_members (
  crew_id TEXT NOT NULL REFERENCES assignment_type_crews(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  role_qualification_id TEXT REFERENCES qualifications(id) ON DELETE SET NULL,
  PRIMARY KEY (crew_id, personnel_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_member ON assignment_type_crew_members(personnel_id);

-- Blocking, and deliberately not overridable: "צוות שלם, בלי חריגות בכלל".
-- A seat on a crewed post belongs to that crew the way a נהג seat belongs to a
-- driver, and an override box in front of it would be an invitation to do the
-- thing the server refuses.
INSERT OR IGNORE INTO scheduling_rules
  (id, org_id, code, name, enabled, severity, overridable, config, created_at, updated_at) VALUES
  ('rule_crew_member','org_default','CREW_MEMBER_ONLY',
   'משימה בסבב קבוע — רק חברי הסבב',1,'blocking',0,'{}',0,0),
  ('rule_crew_mix','org_default','CREW_NO_MIX',
   'משמרת אחת היא סבב אחד',1,'blocking',0,'{}',0,0);

-- קלע is a seat on חפ״ק and nothing in the schedule knew the word.
INSERT OR IGNORE INTO qualifications
  (id, org_id, code, name, description, active, exclusive, blocks_scheduling, created_at, updated_at)
VALUES ('qlf_marksman','org_default','MARKSMAN','קלע','קלע בצוות חפ״ק',1,0,0,0,0);

-- חפ״ק stands again, round the clock, handed over once a day.
UPDATE assignment_types
   SET active = 1, standing = 1, shift_hours = 24, shift_start_hour = 0, shift_start_minute = 0,
       required_headcount = 4, updated_at = 0
 WHERE id = 'atp_hafak';

-- Four named seats for four people: מפקד, נהג, חובש, קלע. With the headcount at
-- four there is no plain seat left, which is the point — every place on this
-- post is somebody's job.
-- Joined to the post rather than naming it as a literal: a post somebody has
-- since removed would otherwise make this a foreign key violation and take the
-- whole migration down with it. If it is gone, this adds nothing, which is the
-- correct answer.
INSERT OR IGNORE INTO assignment_type_qualifications
  (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 1
  FROM assignment_types t
  JOIN qualifications q
    ON q.org_id = t.org_id AND q.code IN ('CMD','DRIVER','MEDIC','MARKSMAN')
 WHERE t.id = 'atp_hafak';
