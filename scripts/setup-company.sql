-- Standing posts for the company, and the qualifications they require.
-- Run once in the D1 console (or with `wrangler d1 execute --file`).
-- Safe to re-run: existing rows with the same ids are replaced, and nothing
-- else in the database is touched.

INSERT OR REPLACE INTO qualifications (id, org_id, code, name, description, active, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','רשאי לנהוג ברכב המשימה',1,0,0),
  ('qlf_commander','org_default','CMD','מפקד','רשאי לפקד על המשימה',1,0,0);

INSERT OR REPLACE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color, instructions, active, created_at, updated_at) VALUES
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',480,1,1,'brand',NULL,1,0,0),
  ('atp_siur','org_default','סיור','תורנויות קבועות',480,4,1,'amber',NULL,1,0,0),
  ('atp_carmel','org_default','כרמל','תורנויות קבועות',480,4,1,'info',NULL,1,0,0),
  ('atp_bathefer','org_default','בת חפר','תורנויות קבועות',480,2,2,'slate',NULL,1,0,0);

-- סיור and כרמל each need a driver and a commander among their four.
DELETE FROM assignment_type_qualifications WHERE assignment_type_id IN ('atp_siur','atp_carmel');
INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id) VALUES
  ('atp_siur','qlf_driver'),
  ('atp_siur','qlf_commander'),
  ('atp_carmel','qlf_driver'),
  ('atp_carmel','qlf_commander');
