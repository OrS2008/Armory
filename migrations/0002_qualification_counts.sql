-- A standing post needs a driver and a commander *among* its crew, not four
-- people who are each both. `min_count` distinguishes the two:
--   0  every assignee must hold the qualification (the original meaning)
--   N  at least N of the assignees must hold it
ALTER TABLE assignment_type_qualifications ADD COLUMN min_count INTEGER NOT NULL DEFAULT 0;
