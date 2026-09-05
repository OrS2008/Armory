-- חפ״ק: one post, a fourth seat somebody can fill, and a week-long tour.
--
-- Three separate things were stopping the rotation from being expressible, and
-- all three are in the data rather than the code.
--
-- 1. Two posts. "חפ״ק" carried the crews and no shifts; "חפק" carried seventy
--    shifts — 3 September to 11 November, exactly the period asked for — and no
--    crews. So the restriction was laid on the post nobody stands, while the
--    post the company actually stands would take anybody. The crews move to the
--    shifts; the empty duplicate goes, and it costs nothing, having no shifts
--    to lose.
--
-- 2. The fourth seat asked for מפלג. That mark means "has a job, not a shift" —
--    its holder is never scheduled at all — so the seat could never be filled
--    by anybody, and a crew of four could only ever be three. The crews name a
--    חובש, which is what a חפ״ק carries.
--
-- 3. A crew holds it for a week. Seven touching twenty-four-hour turns is a
--    168-hour run, and the continuous-duty rule refused every one after the
--    first. The allowance follows the principle 0019 established — a post's
--    allowance is what the post says it stands — carried from its turn to its
--    tour, because a stated tour is not somebody stacking turns either.
--
-- Which of the two posts survives is decided by which has the shifts rather
-- than by naming an id, because which row is which is a fact about this
-- database. Where only one חפ״ק exists the two ids are equal and every
-- statement below is a no-op, so this is safe on a database that never had the
-- duplicate.
ALTER TABLE assignment_types ADD COLUMN rotation_days INTEGER;
ALTER TABLE assignment_types ADD COLUMN rotation_anchor_day TEXT;

-- The crews follow the shifts.
UPDATE assignment_type_crews
   SET assignment_type_id = (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1)
 WHERE assignment_type_id = (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) ASC,
              t.id DESC
     LIMIT 1)
   AND (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1) <> (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) ASC,
              t.id DESC
     LIMIT 1);

-- מפלג out: a seat reserved for somebody who is never scheduled stays empty.
DELETE FROM assignment_type_qualifications
 WHERE assignment_type_id = (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1)
   AND qualification_id IN (SELECT id FROM qualifications WHERE code = 'MEFALEG' OR name = 'מפלג');

-- חובש in: the seat the crews actually name.
INSERT OR IGNORE INTO assignment_type_qualifications (assignment_type_id, qualification_id, min_count)
SELECT (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1), q.id, 1
  FROM qualifications q
 WHERE (q.code = 'MEDIC' OR q.name = 'חובש')
   AND (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1) IS NOT NULL;

-- A week each, anchored to the week the first shift already on the board falls
-- in, so laying the period out again from a later date does not shuffle who
-- holds which week.
UPDATE assignment_types
   SET rotation_days = 7,
       rotation_anchor_day = COALESCE(
         (SELECT date(MIN(i.start_at)/1000, 'unixepoch')
            FROM assignment_instances i
           WHERE i.assignment_type_id = assignment_types.id),
         rotation_anchor_day
       ),
       max_continuous_minutes = 7 * 24 * 60,
       updated_at = 0
 WHERE id = (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1);

-- The empty duplicate, and only ever the empty one.
DELETE FROM assignment_types
 WHERE id = (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) ASC,
              t.id DESC
     LIMIT 1)
   AND (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) DESC,
              t.id
     LIMIT 1) <> (SELECT t.id FROM assignment_types t
     WHERE t.name IN ('חפק', 'חפ"ק', 'חפ״ק')
     ORDER BY (SELECT COUNT(*) FROM assignment_instances i WHERE i.assignment_type_id = t.id) ASC,
              t.id DESC
     LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM assignment_instances i WHERE i.assignment_type_id = assignment_types.id);
