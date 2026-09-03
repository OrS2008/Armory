-- "רק מי שיש לו הכשר נהג יכול להיות נהג. אין מצב שאתה מערבב לי את זה."
--
-- Whoever fills a named seat holds that seat's mark. The API now refuses the
-- rest outright, outside the rules engine, so this is no longer a rule anybody
-- can talk their way past: what is left for the rule to do is name the
-- violations already in the data and colour them on the sheet.
--
-- So it stops being overridable. A blocking rule with `overridable = 1` puts a
-- reason box in front of the reader — an invitation to do the thing, which the
-- server will now refuse anyway, and an invitation is not what "אין מצב" means.
UPDATE scheduling_rules
   SET enabled = 1, overridable = 0
 WHERE code = 'ROLE_QUALIFICATION';
