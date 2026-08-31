-- The unit's actual duty sheet carries more than the four posts modelled so
-- far, and two of the four already here run a different rhythm than assumed.
--
-- New: חובש תורן (a duty medic, 24 hours, nobody but the medic on call),
-- חפ"ק (a command-post crew, 24 hours, the same driver-and-commander shape as
-- כרמל), and חמ"ל (a single seat, handed over every eight hours from 06:00).
--
-- Renamed: סיור is now called עיט, כרמל is now "כיתת כוננות א׳ כרמל" — same
-- posts, same ids, the unit's own names for them.
--
-- Retimed: עיט, ש״ג and נחל שכם now start their day at 05:00 rather than
-- midnight, and נחל שכם hands over every six hours instead of eight.

-- חובש תורן needs its own mark; nothing before this needed one.
INSERT OR IGNORE INTO qualifications
  (id, org_id, code, name, description, active, exclusive, blocks_scheduling, created_at, updated_at) VALUES
  ('qlf_medic','org_default','MEDIC','חובש','הסמכת חובש',1,0,0,0,0);

UPDATE assignment_types SET name = 'עיט', updated_at = 0
 WHERE org_id = 'org_default' AND name = 'סיור';
UPDATE assignment_types SET name = 'כיתת כוננות א׳ כרמל', updated_at = 0
 WHERE org_id = 'org_default' AND name = 'כרמל';

-- עיט and ש״ג keep their rhythm; נחל שכם now hands over every six hours. All
-- three now start the day at 05:00 instead of midnight.
UPDATE assignment_types
   SET shift_start_hour = 5, updated_at = 0
 WHERE org_id = 'org_default' AND name IN ('עיט','ש״ג','נחל שכם');
UPDATE assignment_types
   SET shift_hours = 6, default_duration_minutes = 360, updated_at = 0
 WHERE org_id = 'org_default' AND name = 'נחל שכם';

INSERT OR IGNORE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, active, standing, shift_hours, shift_start_hour, created_at, updated_at) VALUES
  ('atp_medic','org_default','חובש תורן','תורנויות קבועות',1440,1,1,'success',NULL,1,1,24,0,0,0),
  ('atp_hafak','org_default','חפ"ק','תורנויות קבועות',1440,4,1,'slate',NULL,1,1,24,0,0,0),
  ('atp_hamal','org_default','חמ"ל','תורנויות קבועות',480,1,1,'brand',NULL,1,1,8,6,0,0);

-- חפ"ק needs one driver and one commander among its four, same as כרמל.
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 1 FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name = 'חפ"ק' AND q.code IN ('DRIVER','CMD');

-- min_count 0 binds the single seat: only the medic on call can stand it.
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 0 FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name = 'חובש תורן' AND q.code = 'MEDIC';

-- מבצעים is barred from every routine line post, and the three new ones are
-- no exception — otherwise the department that already has its own work is
-- the department auto-fill reaches for first.
INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id)
SELECT t.id, q.id FROM assignment_types t, qualifications q
 WHERE t.org_id = 'org_default' AND q.org_id = 'org_default'
   AND t.name IN ('חובש תורן','חפ"ק','חמ"ל') AND q.code = 'OPS';
