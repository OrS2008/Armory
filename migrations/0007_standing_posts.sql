-- Standing posts, and the marks that decide who may stand them.
--
-- The company's duty sheet is not written a day at a time: ש״ג, סיור, נחל שכם
-- and כרמל run round the clock for months, handed over every eight hours. Two
-- things were missing to express that.
--
-- 1. A post has to be able to say who may *not* stand it. Until now a post
--    could only require a qualification; "אי אפשר לשבץ חייל מהמבצעים" is the
--    other direction, and there was nowhere to put it.
-- 2. The post itself has to know that it is standing, and how long a shift is,
--    so a whole period can be laid out in one action.
--
-- Rows are matched by code and by name rather than by id throughout. A database
-- that already carries a מפקד qualification — under whatever id its own setup
-- gave it — must end up with that one marked, not with a second one beside it.

-- ------------------------------------------------------------------ marks --

-- A mark that takes its holder out of the rotation entirely: מפלג is somebody's
-- job, not a shift they can be handed.
ALTER TABLE qualifications
  ADD COLUMN blocks_scheduling INTEGER NOT NULL DEFAULT 0 CHECK(blocks_scheduling IN (0,1));

INSERT OR IGNORE INTO qualifications
  (id, org_id, code, name, description, active, exclusive, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','רשאי לנהוג ברכב המשימה',1,0,0,0),
  ('qlf_commander','org_default','CMD','מפקד','רשאי לפקד על המשימה',1,0,0,0),
  ('qlf_operations','org_default','OPS','מבצעים','משרת במחלקת מבצעים',1,0,0,0),
  ('qlf_platoon_sergeant','org_default','MAFLAG','מפלג','מפלג — אינו משובץ למשימות',1,0,0,0),
  ('qlf_post_officer','org_default','POST_OFFICER','קצין מוצב','משובץ למשימת קצין מוצב בלבד',1,0,0,0);

UPDATE qualifications
   SET blocks_scheduling = 1, updated_at = 0
 WHERE org_id = 'org_default' AND code = 'MAFLAG';
UPDATE qualifications
   SET exclusive = 1, updated_at = 0
 WHERE org_id = 'org_default' AND code = 'POST_OFFICER';

-- ------------------------------------------------------------ exclusions --

-- The mirror image of assignment_type_qualifications: holding this disqualifies
-- rather than qualifies.
CREATE TABLE IF NOT EXISTS assignment_type_exclusions (
  assignment_type_id TEXT NOT NULL REFERENCES assignment_types(id) ON DELETE CASCADE,
  qualification_id TEXT NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_type_id, qualification_id)
);

-- --------------------------------------------------------- standing posts --

-- A standing post is covered without a break: 24 hours a day, handed over every
-- shift_hours, starting at shift_start_hour. That is what lets a whole period be
-- laid out in one action instead of a day at a time.
ALTER TABLE assignment_types
  ADD COLUMN standing INTEGER NOT NULL DEFAULT 0 CHECK(standing IN (0,1));
ALTER TABLE assignment_types
  ADD COLUMN shift_hours INTEGER NOT NULL DEFAULT 8 CHECK(shift_hours IN (2,3,4,6,8,12,24));
ALTER TABLE assignment_types
  ADD COLUMN shift_start_hour INTEGER NOT NULL DEFAULT 0
    CHECK(shift_start_hour >= 0 AND shift_start_hour < 24);

INSERT OR IGNORE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, active, created_at, updated_at) VALUES
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',480,1,1,'brand',NULL,1,0,0),
  ('atp_siur','org_default','סיור','תורנויות קבועות',480,4,1,'amber',NULL,1,0,0),
  ('atp_carmel','org_default','כרמל','תורנויות קבועות',480,4,1,'info',NULL,1,0,0),
  ('atp_nahalshechem','org_default','נחל שכם','תורנויות קבועות',480,2,2,'slate',NULL,1,0,0),
  ('atp_post_officer','org_default','קצין מוצב','תורנויות קבועות',1440,1,1,'success',NULL,1,0,0);

-- סיור and נחל שכם hand over every eight hours: three shifts a day.
UPDATE assignment_types
   SET standing = 1, shift_hours = 8, shift_start_hour = 0,
       default_duration_minutes = 480, active = 1, updated_at = 0
 WHERE org_id = 'org_default' AND name IN ('סיור','נחל שכם');
-- כרמל and קצין מוצב are both full-day crews: one shift a day.
UPDATE assignment_types
   SET standing = 1, shift_hours = 24, shift_start_hour = 0,
       default_duration_minutes = 1440, active = 1, updated_at = 0
 WHERE org_id = 'org_default' AND name IN ('כרמל','קצין מוצב');
-- ש״ג hands over every four hours: six shifts a day.
UPDATE assignment_types
   SET standing = 1, shift_hours = 4, shift_start_hour = 0,
       default_duration_minutes = 240, active = 1, updated_at = 0
 WHERE org_id = 'org_default' AND name = 'ש״ג';

UPDATE assignment_types SET required_headcount = 1
 WHERE org_id = 'org_default' AND name IN ('ש״ג','קצין מוצב');
UPDATE assignment_types SET required_headcount = 2
 WHERE org_id = 'org_default' AND name = 'נחל שכם';
UPDATE assignment_types SET required_headcount = 4
 WHERE org_id = 'org_default' AND name IN ('סיור','כרמל');

-- סיור and כרמל each need one driver and one commander *among* their four —
-- min_count 1, not 0, which would demand that all four hold both.
DELETE FROM assignment_type_qualifications
 WHERE assignment_type_id IN (
   SELECT id FROM assignment_types
    WHERE org_id = 'org_default' AND name IN ('סיור','כרמל','קצין מוצב')
 );

INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 1 FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name IN ('סיור','כרמל') AND q.code IN ('DRIVER','CMD');

-- min_count 0 binds every seat rather than adding one: the shift is a single
-- קצין מוצב, and only a קצין מוצב can stand it.
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 0 FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name = 'קצין מוצב' AND q.code = 'POST_OFFICER';

DELETE FROM assignment_type_exclusions
 WHERE assignment_type_id IN (
   SELECT id FROM assignment_types
    WHERE org_id = 'org_default' AND name IN ('סיור','כרמל','ש״ג','נחל שכם')
 );

INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id)
SELECT t.id, q.id FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name IN ('סיור','כרמל','נחל שכם','ש״ג') AND q.code = 'OPS';

-- ש״ג is stood by a לוחם: not somebody from מבצעים, and not a commander.
INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id)
SELECT t.id, q.id FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name = 'ש״ג' AND q.code = 'CMD';

-- ------------------------------------------------------------------ rules --

INSERT OR IGNORE INTO scheduling_rules
  (id, org_id, code, name, enabled, severity, overridable, config, created_at, updated_at) VALUES
  ('rule_excluded','org_default','EXCLUDED_QUALIFICATION','סימון הפוסל שיבוץ לסוג המשימה',1,'blocking',1,'{}',0,0),
  ('rule_not_schedulable','org_default','NOT_SCHEDULABLE','מסומן כמי שאינו משובץ למשימות',1,'blocking',1,'{}',0,0);

-- Eight hours on, sixteen off. The rest is enforced rather than noted, because
-- a note is something nothing acts on — but it stays overridable, so a
-- commander can still say yes with a reason that is recorded.
UPDATE scheduling_rules
   SET severity = 'blocking', overridable = 1, config = '{"minutes":960}', updated_at = 0
 WHERE code = 'MIN_REST';
UPDATE scheduling_rules
   SET config = '{"minutes":480}', updated_at = 0
 WHERE code = 'MAX_CONTINUOUS';

-- There is no publication step any more: the sheet goes out as a PDF in the
-- group chat, so "changes that were never published" is not a real condition.
UPDATE scheduling_rules SET enabled = 0, updated_at = 0 WHERE code = 'UNPUBLISHED_CHANGES';
