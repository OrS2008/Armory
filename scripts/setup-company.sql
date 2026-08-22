-- Standing posts for the company, and the marks that decide who may stand them.
--
-- Everything here is also applied by `migrations/0007_standing_posts.sql`, so a
-- database that has run its migrations is already set up. This file exists to
-- put it back after somebody edits a post by hand and wants the defaults again.
-- Safe to re-run: it touches nothing but the posts and the marks.

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
  ('qlf_post_officer','org_default','POST_OFFICER','קצין מוצב','משובץ למשימת קצין מוצב בלבד',1,1,0,0,0);

-- standing = 1: covered without a break, handed over every shift_hours from
-- shift_start_hour. This is what "פריסת תקופה" lays out across a period.
INSERT OR REPLACE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, active, standing, shift_hours, shift_start_hour, created_at, updated_at) VALUES
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',480,1,1,'brand',NULL,1,1,8,0,0,0),
  ('atp_siur','org_default','סיור','תורנויות קבועות',480,4,1,'amber',NULL,1,1,8,0,0,0),
  ('atp_carmel','org_default','כרמל','תורנויות קבועות',480,4,1,'info',NULL,1,1,8,0,0,0),
  ('atp_nahalshechem','org_default','נחל שכם','תורנויות קבועות',480,2,2,'slate',NULL,1,1,8,0,0,0),
  ('atp_post_officer','org_default','קצין מוצב','תורנויות קבועות',1440,1,1,'success',NULL,1,1,24,0,0,0),
  ('atp_yezuma','org_default','יזומה','פעילות יזומה',240,2,3,'success','משימה חד־פעמית שנקבעת מעבר לתורנויות הקבועות.',1,0,8,0,0,0);

-- סיור and כרמל each need one driver and one commander *among* their four —
-- min_count 1, not 0, which would demand that all four hold both.
DELETE FROM assignment_type_qualifications
 WHERE assignment_type_id IN ('atp_siur','atp_carmel','atp_post_officer');
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count) VALUES
  ('atp_siur','qlf_driver',1),
  ('atp_siur','qlf_commander',1),
  ('atp_carmel','qlf_driver',1),
  ('atp_carmel','qlf_commander',1),
  -- min_count 0 binds every seat rather than adding one: the shift is a single
  -- קצין מוצב, and only a קצין מוצב can stand it.
  ('atp_post_officer','qlf_post_officer',0);

-- Who may *not* stand a post. The mirror image of the table above.
DELETE FROM assignment_type_exclusions
 WHERE assignment_type_id IN ('atp_siur','atp_carmel','atp_shag','atp_nahalshechem');
INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id) VALUES
  ('atp_siur','qlf_operations'),
  ('atp_carmel','qlf_operations'),
  ('atp_nahalshechem','qlf_operations'),
  -- ש״ג is stood by a לוחם: not somebody from מבצעים, and not a commander.
  ('atp_shag','qlf_operations'),
  ('atp_shag','qlf_commander');
