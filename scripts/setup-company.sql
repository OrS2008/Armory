-- Standing posts for the company, and the marks that decide who may stand them.
--
-- Everything here is also applied by the `migrations/` — `0007_standing_posts.sql`
-- through `0010_sheet_layout.sql` — so a database that has run its migrations
-- is already set up. This file exists to put it back after somebody edits a post
-- by hand and wants the defaults again. Safe to re-run: it touches nothing but
-- the posts and the marks.

-- exclusive = 1 narrows the holder instead of merely permitting them: whoever
-- is marked קצין מוצב stands קצין מוצב and nothing else.
-- blocks_scheduling = 1 takes them out of the rotation altogether: מפלג is
-- somebody's job, not a shift they can be handed.
INSERT OR REPLACE INTO qualifications
  (id, org_id, code, name, description, active, exclusive, blocks_scheduling, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','רשאי לנהוג ברכב המשימה',1,0,0,0,0),
  ('qlf_commander','org_default','CMD','מפקד','רשאי לפקד על המשימה',1,0,0,0,0),
  ('qlf_operations','org_default','OPS','מבצעים','משרת במחלקת מבצעים',1,0,0,0,0),
  ('qlf_platoon_sergeant','org_default','MAFLAG','מפלג','מפלג — אינו משובץ למשימות',1,0,1,0,0),
  ('qlf_post_officer','org_default','POST_OFFICER','קצין מוצב','משובץ למשימת קצין מוצב בלבד',1,1,0,0,0),
  ('qlf_medic','org_default','MEDIC','חובש','הסמכת חובש',1,0,0,0,0);

-- standing = 1: covered without a break, handed over every shift_hours from
-- shift_start_hour:shift_start_minute. This is what "פריסת תקופה" lays out.
--
-- priority and sheet_column together are the printed page: the sheet has three
-- columns, read right to left, and each post sits in a known place in one of
-- them. section names the gate a post is stood at — when a post has one, the
-- gate names the card and the post names its own shifts (משקיף בוקר).
-- sheet_label is what the title bar prints when that differs from the post's
-- name; crew_role_suffix turns מפקד into מפקד סיור on that post alone.
--
-- briefing_minutes_before stamps a per-shift note ("תדריך עלייה לעיט בוקר
-- בשעה 04:30") when the standing roster is laid out. A handover time that is
-- the same every day is a static line in instructions instead.
INSERT OR REPLACE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, briefing_minutes_before, section, sheet_label, crew_role_suffix, sheet_column,
   active, standing, shift_hours, shift_start_hour, shift_start_minute,
   created_at, updated_at) VALUES
  -- Column 1, right to left: קצין מוצב, the שער הדוקטור crews, חמ"ל.
  ('atp_post_officer','org_default','קצין מוצב','תורנויות קבועות',1440,1,1,'success',
   NULL,NULL,NULL,'קצין מוצב - 24 שעות',NULL,1,1,1,24,0,0,0,0),
  ('atp_mashkif','org_default','משקיף','תורנויות קבועות',480,4,2,'amber',
   NULL,30,'שער הדוקטור',NULL,'סיור',1,1,1,8,6,30,0,0),
  ('atp_hamal','org_default','חמ"ל','תורנויות קבועות',480,1,3,'rose',
   NULL,NULL,NULL,NULL,NULL,1,1,1,8,6,0,0,0),
  -- Column 2: חובש תורן, the שער עתיד crews, כיתת כוננות.
  ('atp_medic','org_default','חובש תורן','תורנויות קבועות',1440,1,4,'success',
   NULL,NULL,NULL,'חובש תורן - 24 שעות',NULL,2,1,1,24,0,0,0,0),
  ('atp_siur','org_default','עיט','תורנויות קבועות',480,4,5,'brand',
   NULL,30,'שער עתיד - חקלאים',NULL,'סיור',2,1,1,8,5,0,0,0),
  ('atp_carmel','org_default','כיתת כוננות א׳ כרמל','תורנויות קבועות',1440,4,6,'info',
   'החלפה בשעה 22:00',NULL,NULL,'כיתת כוננות - כרמל א׳ 24 ש',NULL,2,1,1,24,0,0,0,0),
  -- Column 3: the single-seat rounds.
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',240,1,7,'brand',
   NULL,NULL,NULL,'ש.ג. - 4 שעות משמרת',NULL,3,1,1,4,5,0,0,0),
  ('atp_bolem','org_default','בולם','תורנויות קבועות',360,1,8,'brand',
   'תדריך 20 דק לפני משמרת, יציאה 10 דק לפני משמרת',NULL,NULL,NULL,NULL,3,1,1,6,6,0,0,0),
  ('atp_nahalshechem','org_default','נחל שכם','תורנויות קבועות',360,2,9,'slate',
   'תדריך 20 דק לפני משמרת, יציאה 10 דק לפני משמרת',NULL,NULL,NULL,NULL,3,1,1,6,5,0,0,0),
  -- Not a standing post: it prints only on the days somebody schedules one.
  ('atp_yezuma','org_default','יזומה','פעילות יזומה',240,2,10,'success',
   'משימה חד־פעמית שנקבעת מעבר לתורנויות הקבועות.',NULL,NULL,NULL,NULL,3,1,0,8,0,0,0,0),
  -- Retired: not on the company's sheet. Kept so the days it was stood still
  -- read back, and so turning it on again is a checkbox.
  ('atp_hafak','org_default','חפ"ק','תורנויות קבועות',1440,4,11,'slate',
   NULL,NULL,NULL,NULL,NULL,NULL,0,0,24,0,0,0,0);

-- עיט, משקיף and כיתת כוננות א׳ כרמל each need one driver and one commander
-- *among* their four — min_count 1, not 0, which would demand that all four
-- hold both.
DELETE FROM assignment_type_qualifications
 WHERE assignment_type_id IN
   ('atp_siur','atp_mashkif','atp_carmel','atp_hafak','atp_post_officer','atp_medic');
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count) VALUES
  ('atp_siur','qlf_driver',1),
  ('atp_siur','qlf_commander',1),
  ('atp_mashkif','qlf_driver',1),
  ('atp_mashkif','qlf_commander',1),
  ('atp_carmel','qlf_driver',1),
  ('atp_carmel','qlf_commander',1),
  ('atp_hafak','qlf_driver',1),
  ('atp_hafak','qlf_commander',1),
  -- min_count 0 binds every seat rather than adding one: the shift is a
  -- single person, and only that mark can stand it.
  ('atp_post_officer','qlf_post_officer',0),
  ('atp_medic','qlf_medic',0);

-- Who may *not* stand a post. The mirror image of the table above. מבצעים is
-- barred from every routine line post — the three new ones are no exception,
-- or the department that already has its own work is the department
-- auto-fill reaches for first.
DELETE FROM assignment_type_exclusions
 WHERE assignment_type_id IN
   ('atp_siur','atp_mashkif','atp_carmel','atp_shag','atp_nahalshechem','atp_bolem',
    'atp_medic','atp_hafak','atp_hamal');
INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id) VALUES
  ('atp_siur','qlf_operations'),
  ('atp_mashkif','qlf_operations'),
  ('atp_bolem','qlf_operations'),
  ('atp_carmel','qlf_operations'),
  ('atp_nahalshechem','qlf_operations'),
  ('atp_medic','qlf_operations'),
  ('atp_hafak','qlf_operations'),
  ('atp_hamal','qlf_operations'),
  -- ש״ג is stood by a לוחם: not somebody from מבצעים, and not a commander.
  ('atp_shag','qlf_operations'),
  ('atp_shag','qlf_commander');
