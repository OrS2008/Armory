-- An exclusive mark with nothing requiring it takes its holders off the board.
--
-- "קצין מוצב" narrows whoever holds it to the posts that ask for it — that is
-- what ייעודי means, and EXCLUSIVE_QUALIFICATION enforces it. Migration 0007
-- gave the קצין מוצב post that requirement; production no longer had it, and
-- the result was six people blocked from every shift in the company rather
-- than reserved for one.
--
-- min_count 0 binds every seat rather than adding one: the shift is a single
-- person and only that mark may stand it, which is how the post has been
-- described since it was first laid out.
--
-- OR IGNORE, and matched by id: a database that still carries the requirement
-- is left exactly as it is.
INSERT OR IGNORE INTO assignment_type_qualifications
  (assignment_type_id, qualification_id, min_count)
SELECT t.id, q.id, 0
  FROM assignment_types t
  JOIN qualifications q ON q.org_id = t.org_id AND q.code = 'POST_OFFICER'
 WHERE t.id = 'atp_post_officer';
