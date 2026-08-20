-- Demo data for local development only. Never run this against production.
-- Usage: npm run db:seed:local
DELETE FROM assignment_personnel;
DELETE FROM assignment_instances;
DELETE FROM availability;
DELETE FROM personnel_qualifications;
DELETE FROM assignment_type_qualifications;
DELETE FROM assignment_types;
DELETE FROM qualifications;
DELETE FROM personnel;
DELETE FROM schedules;
DELETE FROM units;

INSERT INTO units (id, org_id, parent_id, name, kind, sort_order, active, created_at, updated_at) VALUES
  ('unt_company','org_default',NULL,'פלוגה א׳','company',0,1,0,0),
  ('unt_p1','org_default','unt_company','מחלקה 1','platoon',1,1,0,0),
  ('unt_p2','org_default','unt_company','מחלקה 2','platoon',2,1,0,0);

INSERT INTO qualifications (id, org_id, code, name, description, active, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','הרשאת נהיגה בתוקף',1,0,0),
  ('qlf_medic','org_default','MEDIC','חובש','הסמכת חובש',1,0,0),
  ('qlf_cmd','org_default','CMD','מפקד תורן','הסמכה לתורנות פיקודית',1,0,0);

INSERT INTO personnel (id, org_id, unit_id, external_id, display_name, role_title, phone, status, notes, created_at, updated_at) VALUES
  ('per_1','org_default','unt_p1','1000001','דניאל כהן','לוחם',NULL,'active',NULL,0,0),
  ('per_2','org_default','unt_p1','1000002','נועה לוי','חובשת',NULL,'active',NULL,0,0),
  ('per_3','org_default','unt_p1','1000003','יוסי אברהם','נהג',NULL,'active',NULL,0,0),
  ('per_4','org_default','unt_p2','1000004','מאיה שרון','לוחמת',NULL,'active',NULL,0,0),
  ('per_5','org_default','unt_p2','1000005','איתי בר','מפקד תורן',NULL,'active',NULL,0,0),
  ('per_6','org_default','unt_p2','1000006','שירה נחום','לוחמת',NULL,'active',NULL,0,0);

INSERT INTO personnel_qualifications (personnel_id, qualification_id, granted_at) VALUES
  ('per_2','qlf_medic',0),
  ('per_3','qlf_driver',0),
  ('per_5','qlf_cmd',0),
  ('per_5','qlf_driver',0);

INSERT INTO assignment_types (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color, instructions, active, created_at, updated_at) VALUES
  ('atp_guard','org_default','שמירה','ביטחון שוטף',480,2,1,'brand',NULL,1,0,0),
  ('atp_kitchen','org_default','תורנות מטבח','תורנויות',360,1,3,'slate',NULL,1,0,0),
  ('atp_duty','org_default','תורן פלוגה','תורנויות',720,1,2,'amber',NULL,1,0,0);

INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id) VALUES
  ('atp_duty','qlf_cmd');

INSERT INTO schedules (id, org_id, unit_id, name, start_date, end_date, status, version, created_at, updated_at)
VALUES ('sch_demo','org_default',NULL,'שבצ״ק שבועי לדוגמה', date('now'), date('now','+6 day'), 'draft', 0, 0, 0);
