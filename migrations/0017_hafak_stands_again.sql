-- חפ״ק is not there any more.
--
-- 0016 tried to give the post four named seats and failed on a foreign key:
-- atp_hafak had been removed from the company's posts at some point, so there
-- was nothing to attach them to. The unit stands it again — two rotations of
-- four, round the clock, handed over once a day — so the post comes back.
--
-- OR IGNORE by id: a database that still has it is left exactly as it is,
-- including any renaming or layout somebody has done to it since.
INSERT OR IGNORE INTO assignment_types
  (id, org_id, name, category, default_duration_minutes, required_headcount, priority, color,
   instructions, briefing_minutes_before, section, sheet_label, crew_role_suffix, sheet_column,
   active, standing, shift_hours, shift_start_hour, shift_start_minute, created_at, updated_at)
VALUES
  ('atp_hafak','org_default','חפ"ק','תורנויות קבועות',1440,4,11,'slate',
   NULL,NULL,NULL,NULL,NULL,NULL,1,1,24,0,0,0,0);

-- Four named seats for four people — מפקד, נהג, חובש, קלע. With the headcount
-- at four there is no plain seat left, which is the point: every place on this
-- post is somebody's job. 0016 could not add these, because the post was gone.
INSERT OR IGNORE INTO assignment_type_qualifications
  (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 1
  FROM assignment_types t
  JOIN qualifications q
    ON q.org_id = t.org_id AND q.code IN ('CMD','DRIVER','MEDIC','MARKSMAN')
 WHERE t.id = 'atp_hafak';

-- מבצעים is barred from every routine line post, and this one is no exception.
INSERT OR IGNORE INTO assignment_type_exclusions (assignment_type_id, qualification_id)
SELECT t.id, q.id
  FROM assignment_types t
  JOIN qualifications q ON q.org_id = t.org_id AND q.code = 'OPS'
 WHERE t.id = 'atp_hafak';
