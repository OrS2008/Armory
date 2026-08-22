-- Demo data for local development and the end-to-end suite. Never run this
-- against production: it clears the roster and the posts before writing.
--
-- The posts and the marks are the real ones — ש״ג, סיור, נחל שכם, כרמל,
-- קצין מוצב — because a demo roster that cannot express "אי אפשר לשבץ חייל
-- מהמבצעים" is not exercising the thing the company actually needs.
-- Usage: npm run db:seed:local
DELETE FROM assignment_personnel;
DELETE FROM assignment_instances;
DELETE FROM availability;
DELETE FROM personnel_qualifications;
DELETE FROM assignment_type_qualifications;
DELETE FROM assignment_type_exclusions;
DELETE FROM assignment_types;
DELETE FROM qualifications;
DELETE FROM personnel;
DELETE FROM schedules;
DELETE FROM units;

INSERT INTO units (id, org_id, parent_id, name, kind, sort_order, active, created_at, updated_at) VALUES
  ('unt_company','org_default',NULL,'פלוגה א׳','company',0,1,0,0),
  ('unt_p1','org_default','unt_company','מחלקה 1','platoon',1,1,0,0),
  ('unt_p2','org_default','unt_company','מחלקה 2','platoon',2,1,0,0),
  ('unt_ops','org_default','unt_company','מחלקת מבצעים','platoon',3,1,0,0);

-- exclusive = 1 narrows its holder to the post that asks for it.
-- blocks_scheduling = 1 takes them out of the rotation altogether.
INSERT INTO qualifications
  (id, org_id, code, name, description, active, exclusive, blocks_scheduling, created_at, updated_at) VALUES
  ('qlf_driver','org_default','DRIVER','נהג','רשאי לנהוג ברכב המשימה',1,0,0,0,0),
  ('qlf_commander','org_default','CMD','מפקד','רשאי לפקד על המשימה',1,0,0,0,0),
  ('qlf_operations','org_default','OPS','מבצעים','משרת במחלקת מבצעים',1,0,0,0,0),
  ('qlf_platoon_sergeant','org_default','MAFLAG','מפלג','מפלג — אינו משובץ למשימות',1,0,1,0,0),
  ('qlf_post_officer','org_default','POST_OFFICER','קצין מוצב','משובץ למשימת קצין מוצב בלבד',1,1,0,0,0),
  ('qlf_medic','org_default','MEDIC','חובש','הסמכת חובש',1,0,0,0,0);

INSERT INTO personnel (id, org_id, unit_id, external_id, display_name, role_title, phone, status, notes, created_at, updated_at) VALUES
  ('per_1','org_default','unt_p1','1000001','דניאל כהן','לוחם',NULL,'active',NULL,0,0),
  ('per_2','org_default','unt_p1','1000002','נועה לוי','חובשת',NULL,'active',NULL,0,0),
  ('per_3','org_default','unt_p1','1000003','יוסי אברהם','נהג',NULL,'active',NULL,0,0),
  ('per_4','org_default','unt_p2','1000004','מאיה שרון','לוחמת',NULL,'active',NULL,0,0),
  ('per_5','org_default','unt_p2','1000005','איתי בר','מפקד תורן',NULL,'active',NULL,0,0),
  ('per_6','org_default','unt_p2','1000006','שירה נחום','לוחמת',NULL,'active',NULL,0,0),
  ('per_7','org_default','unt_p1','1000007','אורי פלד','מפקד כיתה',NULL,'active',NULL,0,0),
  ('per_8','org_default','unt_p1','1000008','רועי חדד','נהג',NULL,'active',NULL,0,0),
  ('per_9','org_default','unt_p1','1000009','תמר גל','לוחמת',NULL,'active',NULL,0,0),
  ('per_10','org_default','unt_p1','1000010','עידן מור','לוחם',NULL,'active',NULL,0,0),
  ('per_11','org_default','unt_p2','1000011','ליאור אשר','מפקד כיתה',NULL,'active',NULL,0,0),
  ('per_12','org_default','unt_p2','1000012','גיא סלע','נהג',NULL,'active',NULL,0,0),
  ('per_13','org_default','unt_p2','1000013','הדר ניר','לוחמת',NULL,'active',NULL,0,0),
  ('per_14','org_default','unt_p2','1000014','עמית רון','לוחם',NULL,'active',NULL,0,0),
  ('per_15','org_default','unt_p1','1000015','נתן ברק','לוחם',NULL,'active',NULL,0,0),
  ('per_16','org_default','unt_p1','1000016','שי דגן','לוחם',NULL,'active',NULL,0,0),
  ('per_17','org_default','unt_p2','1000017','יעל אורן','לוחמת',NULL,'active',NULL,0,0),
  ('per_18','org_default','unt_p2','1000018','דור כרמי','לוחם',NULL,'active',NULL,0,0),
  ('per_19','org_default','unt_ops','1000019','אלון שגב','קצין מבצעים',NULL,'active',NULL,0,0),
  ('per_20','org_default','unt_ops','1000020','רן ביתן','מבצעים',NULL,'active',NULL,0,0),
  ('per_21','org_default','unt_ops','1000021','טל זהבי','מבצעים',NULL,'active',NULL,0,0),
  ('per_22','org_default','unt_company','1000022','משה אלימלך','מפלג',NULL,'active',NULL,0,0),
  ('per_23','org_default','unt_company','1000023','סרן נדב יערי','קצין מוצב',NULL,'active',NULL,0,0),
  ('per_24','org_default','unt_p1','1000024','בר אדרי','נהג',NULL,'active',NULL,0,0);

INSERT INTO personnel_qualifications (personnel_id, qualification_id, granted_at) VALUES
  ('per_2','qlf_medic',0),
  ('per_3','qlf_driver',0),
  ('per_5','qlf_commander',0),
  ('per_5','qlf_driver',0),
  ('per_7','qlf_commander',0),
  ('per_8','qlf_driver',0),
  ('per_11','qlf_commander',0),
  ('per_12','qlf_driver',0),
  ('per_24','qlf_driver',0),
  ('per_19','qlf_operations',0),
  ('per_19','qlf_commander',0),
  ('per_20','qlf_operations',0),
  ('per_21','qlf_operations',0),
  ('per_22','qlf_platoon_sergeant',0),
  ('per_23','qlf_post_officer',0);

-- standing = 1 means the post runs round the clock, handed over every
-- shift_hours; that is what the "פריסת תקופה" action reads.
INSERT INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, active, standing, shift_hours, shift_start_hour, created_at, updated_at) VALUES
  ('atp_shag','org_default','ש״ג','תורנויות קבועות',240,1,1,'brand',NULL,1,1,4,0,0,0),
  ('atp_siur','org_default','סיור','תורנויות קבועות',480,4,1,'amber',NULL,1,1,8,0,0,0),
  ('atp_carmel','org_default','כרמל','תורנויות קבועות',1440,4,1,'info',NULL,1,1,24,0,0,0),
  ('atp_nahalshechem','org_default','נחל שכם','תורנויות קבועות',480,2,2,'slate',NULL,1,1,8,0,0,0),
  ('atp_post_officer','org_default','קצין מוצב','תורנויות קבועות',1440,1,1,'success',NULL,1,1,24,0,0,0),
  ('atp_yezuma','org_default','יזומה','פעילות יזומה',240,2,3,'success','משימה חד־פעמית שנקבעת מעבר לתורנויות הקבועות.',1,0,8,0,0,0);

INSERT INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count) VALUES
  ('atp_siur','qlf_driver',1),
  ('atp_siur','qlf_commander',1),
  ('atp_carmel','qlf_driver',1),
  ('atp_carmel','qlf_commander',1),
  ('atp_post_officer','qlf_post_officer',0);

INSERT INTO assignment_type_exclusions (assignment_type_id, qualification_id) VALUES
  ('atp_siur','qlf_operations'),
  ('atp_carmel','qlf_operations'),
  ('atp_nahalshechem','qlf_operations'),
  ('atp_shag','qlf_operations'),
  ('atp_shag','qlf_commander');

INSERT INTO schedules (id, org_id, unit_id, name, start_date, end_date, status, version, created_at, updated_at)
VALUES ('sch_demo','org_default',NULL,'שבצ״ק שבועי לדוגמה', date('now'), date('now','+6 day'), 'draft', 0, 0, 0);
