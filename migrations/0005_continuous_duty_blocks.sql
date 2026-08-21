-- Continuous duty stops being advisory.
--
-- The rule was seeded as a warning, and a warning is a note that nothing acts
-- on: the schedule kept assigning people sixteen straight hours while
-- reporting, correctly, that it had. It stays overridable, so a commander can
-- still say yes — but has to say it, with a reason that is recorded.
--
-- Relax it again in הגדרות ← כללי שיבוץ if the unit wants it back as a warning.
UPDATE scheduling_rules
   SET severity = 'blocking', updated_at = 0
 WHERE code = 'MAX_CONTINUOUS' AND severity = 'warning';
