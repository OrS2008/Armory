-- Matching the sheet's layout to the unit's own printed roster.
--
-- Two things the board could not yet say:
--
-- 1. עיט holds a briefing before each shift's own start — "תדריך עלייה לעיט
--    בשעה 04:40" for the 05:00 shift — and that time moves with the shift, so
--    it is a fact about the post (briefing_minutes_before) stamped onto each
--    shift's own notes when the standing roster is laid out, not typed by hand
--    onto every occurrence.
-- 2. כרמל hands over at a fixed hour regardless of which shift it is — a
--    static line, so it goes on the post's own instructions instead.
--
-- Priority is also regrouped so that חפ"ק, חובש תורן and קצין מוצב print
-- together on the sheet, the way the unit's own roster lays them out.

ALTER TABLE assignment_types
  ADD COLUMN briefing_minutes_before INTEGER NULL CHECK(
    briefing_minutes_before IS NULL OR (briefing_minutes_before >= 0 AND briefing_minutes_before <= 120)
  );

UPDATE assignment_types
   SET briefing_minutes_before = 20, updated_at = 0
 WHERE org_id = 'org_default' AND name = 'עיט';

UPDATE assignment_types
   SET instructions = 'החלפה בשעה 17:00', updated_at = 0
 WHERE org_id = 'org_default' AND name = 'כיתת כוננות א׳ כרמל';

UPDATE assignment_types
   SET priority = 1, updated_at = 0
 WHERE org_id = 'org_default' AND name IN ('חפ"ק', 'חובש תורן', 'קצין מוצב');

UPDATE assignment_types
   SET priority = 2, updated_at = 0
 WHERE org_id = 'org_default' AND name IN ('ש״ג', 'עיט', 'כיתת כוננות א׳ כרמל', 'נחל שכם', 'חמ"ל');
