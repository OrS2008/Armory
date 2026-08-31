-- The duty sheet, laid out the way the company actually prints it.
--
-- Until now a post carried only its name and its rhythm, and the sheet packed
-- the cards wherever they fitted. The real sheet is not packed: it is a fixed
-- three-column page where each post sits in a known place, gates group the
-- posts that share them, and a 24-hour post prints one name with no clock
-- beside it. Those are all facts about the post, so they are stored on it.

-- The gate a post is stood at — שער הדוקטור, שער עתיד - חקלאים. When a post has
-- one, the gate names the card and the post names its own shifts (משקיף בוקר),
-- which is how the sheet reads out loud.
ALTER TABLE assignment_types ADD COLUMN section TEXT NULL;

-- What the title bar prints, when that differs from the post's name. The name
-- identifies the post everywhere else — dropdowns, conflicts, reports — so the
-- sheet's "קצין מוצב - 24 שעות" is a label, not a rename.
ALTER TABLE assignment_types ADD COLUMN sheet_label TEXT NULL;

-- Appended to every seat label on this post: 'סיור' turns מפקד into מפקד סיור.
-- It belongs to the post, not to the qualification — the same מפקד mark stands
-- כיתת כוננות with no suffix at all.
ALTER TABLE assignment_types ADD COLUMN crew_role_suffix TEXT NULL;

-- Which of the sheet's three columns the post prints in, right to left. NULL
-- lets the sheet place the post itself, which is what an ad-hoc task wants.
ALTER TABLE assignment_types
  ADD COLUMN sheet_column INTEGER NULL CHECK(sheet_column IS NULL OR (sheet_column >= 1 AND sheet_column <= 3));

-- Handovers are not always on the hour: משקיף changes at 06:30.
ALTER TABLE assignment_types
  ADD COLUMN shift_start_minute INTEGER NOT NULL DEFAULT 0
    CHECK(shift_start_minute >= 0 AND shift_start_minute < 60);

-- משקיף — three 8-hour crews a day at שער הדוקטור, handing over on the half
-- hour with a briefing thirty minutes before each.
INSERT OR REPLACE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, briefing_minutes_before, section, sheet_label, crew_role_suffix, sheet_column,
   active, standing, shift_hours, shift_start_hour, shift_start_minute, created_at, updated_at)
VALUES
  ('atp_mashkif','org_default','משקיף','תורנויות קבועות',480,4,2,'amber',
   NULL,30,'שער הדוקטור',NULL,'סיור',1,1,1,8,6,30,0,0),
  -- בולם — one person, four 6-hour turns, with the same standing briefing and
  -- departure rule נחל שכם is stood under.
  ('atp_bolem','org_default','בולם','תורנויות קבועות',360,1,8,'brand',
   'תדריך 20 דק לפני משמרת, יציאה 10 דק לפני משמרת',NULL,NULL,NULL,NULL,3,1,1,6,6,0,0,0);

DELETE FROM assignment_type_qualifications WHERE assignment_type_id = 'atp_mashkif';
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count) VALUES
  ('atp_mashkif','qlf_driver',1),
  ('atp_mashkif','qlf_commander',1);

DELETE FROM assignment_type_exclusions WHERE assignment_type_id IN ('atp_mashkif','atp_bolem');
INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id) VALUES
  ('atp_mashkif','qlf_operations'),
  ('atp_bolem','qlf_operations');

-- Where each standing post sits on the page, read right to left and top to
-- bottom, and how its title bar reads.
UPDATE assignment_types SET sheet_column = 1, priority = 1, sheet_label = 'קצין מוצב - 24 שעות', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_post_officer';
UPDATE assignment_types SET sheet_column = 1, priority = 3, color = 'rose', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_hamal';

UPDATE assignment_types SET sheet_column = 2, priority = 4, sheet_label = 'חובש תורן - 24 שעות', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_medic';
UPDATE assignment_types
   SET sheet_column = 2, priority = 5, section = 'שער עתיד - חקלאים', color = 'brand',
       crew_role_suffix = 'סיור', briefing_minutes_before = 30, updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_siur';
UPDATE assignment_types
   SET sheet_column = 2, priority = 6, sheet_label = 'כיתת כוננות - כרמל א׳ 24 ש',
       instructions = 'החלפה בשעה 22:00', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_carmel';

UPDATE assignment_types SET sheet_column = 3, priority = 7, sheet_label = 'ש.ג. - 4 שעות משמרת', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_shag';
UPDATE assignment_types
   SET sheet_column = 3, priority = 9,
       instructions = 'תדריך 20 דק לפני משמרת, יציאה 10 דק לפני משמרת', updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_nahalshechem';
UPDATE assignment_types SET sheet_column = 3, priority = 10, updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_yezuma';

-- חפ"ק is not on the company's sheet. Deactivated rather than deleted: the
-- post stops being offered and stops being laid out, and turning it back on is
-- a checkbox rather than a migration.
UPDATE assignment_types SET active = 0, standing = 0, updated_at = 0
 WHERE org_id = 'org_default' AND id = 'atp_hafak';

-- Deactivating the post does not clear the empty shifts already laid out for
-- it, and those would keep printing on the sheet. Only the ones still ahead of
-- us with nobody on them are dropped: a shift somebody is standing is that
-- person's shift, and a past one is the record of a day that happened.
DELETE FROM assignment_instances
 WHERE org_id = 'org_default'
   AND assignment_type_id = 'atp_hafak'
   AND start_at > (strftime('%s','now') * 1000)
   AND NOT EXISTS (
     SELECT 1 FROM assignment_personnel ap WHERE ap.assignment_id = assignment_instances.id
   );
