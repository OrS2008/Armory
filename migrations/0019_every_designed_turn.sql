-- A designed turn is not a stacked one — for every post, not just חפ״ק.
--
-- 0018 gave חפ״ק an allowance because MAX_CONTINUOUS was refusing every
-- candidate for it. That was never particular to חפ״ק: any post the company
-- stands for longer than the continuous limit is unfillable by auto-fill for
-- the same reason, and the unit stands several — קצין מוצב, חובש תורן and
-- כיתת כוננות among them. Each looks, on screen, like auto-fill quietly
-- declining to work.
--
-- The allowance is the post's own turn rather than a number chosen here. A
-- post that says it hands over once a day is saying what one turn is; the
-- engine should agree with it, and go on catching two of them back to back,
-- which is what the rule is actually for.
--
-- Self-selecting on purpose: it names no post, so it is right on a database
-- whose posts have been renamed or retimed since, and adds nothing where the
-- turn already fits inside the company limit. Posts that already carry an
-- allowance keep it — a number somebody set by hand is a decision, not a gap.
UPDATE assignment_types
   SET max_continuous_minutes = shift_hours * 60,
       updated_at = 0
 WHERE standing = 1
   AND max_continuous_minutes IS NULL
   AND shift_hours * 60 > COALESCE(
         -- The strictest limit any organisation in this database sets: a post
         -- that outruns the smallest of them is unfillable for somebody.
         (SELECT MIN(CAST(json_extract(config, '$.minutes') AS INTEGER))
            FROM scheduling_rules
           WHERE code = 'MAX_CONTINUOUS'),
         480
       );
