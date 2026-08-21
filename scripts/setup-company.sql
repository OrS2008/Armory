-- Standing posts for the company, and the qualifications they require.
-- Run once in the D1 console (or with `wrangler d1 execute --file`).
-- Safe to re-run: existing rows with the same ids are replaced, and nothing
-- else in the database is touched.

-- exclusive = 1 narrows the holder instead of merely permitting them: whoever
-- is marked חמ״ל is scheduled for חמ״ל and for nothing else.
INSERT OR REPLACE INTO qualifications
  (id, org_id, code, name, description, active, exclusive, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','רשאי לנהוג ברכב המשימה',1,0,0,0),
  ('qlf_commander','org_default','CMD','מפקד','רשאי לפקד על המשימה',1,0,0,0),
  ('qlf_hamal','org_default','HAMAL','חמ״ל','תורן חמ״ל — משובץ לחמ״ל בלבד',1,1,0,0);

INSERT OR REPLACE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color, instructions, active, created_at, updated_at) VALUES
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',480,1,1,'brand',NULL,1,0,0),
  ('atp_siur','org_default','סיור','תורנויות קבועות',480,4,1,'amber',NULL,1,0,0),
  ('atp_carmel','org_default','כרמל','תורנויות קבועות',480,4,1,'info',NULL,1,0,0),
  ('atp_nahalshechem','org_default','נחל שכם','תורנויות קבועות',480,2,2,'slate',NULL,1,0,0),
  ('atp_yezuma','org_default','יזומה','פעילות יזומה',240,2,3,'success','משימה חד־פעמית שנקבעת מעבר לתורנויות הקבועות.',1,0,0),
  ('atp_hamal','org_default','חמ״ל','תורנויות קבועות',480,1,1,'info',NULL,1,0,0);

-- סיור and כרמל each need one driver and one commander *among* their four —
-- min_count 1, not 0, which would demand that all four hold both.
DELETE FROM assignment_type_qualifications
 WHERE assignment_type_id IN ('atp_siur','atp_carmel','atp_hamal');
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count) VALUES
  ('atp_siur','qlf_driver',1),
  ('atp_siur','qlf_commander',1),
  ('atp_carmel','qlf_driver',1),
  ('atp_carmel','qlf_commander',1),
  -- min_count 0 binds every seat rather than adding one: the חמ״ל shift is a
  -- single חמ״ל, and only a חמ״ל can stand it.
  ('atp_hamal','qlf_hamal',0);
