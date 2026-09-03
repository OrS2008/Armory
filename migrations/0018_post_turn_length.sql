-- A post whose turn is long by design is not somebody stacking turns.
--
-- MAX_CONTINUOUS refuses a run of touching shifts longer than eight hours,
-- which is the company's "eight on, sixteen off" stated as a rule. It cannot
-- tell that from a post whose single turn *is* twenty-four hours — חפ״ק, קצין
-- מוצב, חובש תורן, כיתת כוננות — so every candidate for one of those is
-- blocked, and auto-fill proposes nobody at all for a post it should fill.
--
-- The post says its own allowance. NULL keeps the company rule, so nothing
-- changes for the eight-hour posts, which is where the rule earns its keep.
ALTER TABLE assignment_types ADD COLUMN max_continuous_minutes INTEGER;

-- חפ״ק is handed over once a day, and the unit says so.
UPDATE assignment_types
   SET max_continuous_minutes = 1440, updated_at = 0
 WHERE id = 'atp_hafak';
