-- Putting your name down for a seat nobody is standing.
--
-- This is not a replacement: there is nobody to replace. A shift short of
-- people is a hole the commander is trying to fill, and somebody free who
-- would take it is the answer — but there was no way to say so, so it was
-- said in the group chat or not at all.
--
-- An offer, not an assignment: the commander still decides who stands where.
CREATE TABLE shift_volunteers (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment_instances(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  -- The seat offered for. NULL is a plain one.
  role_qualification_id TEXT REFERENCES qualifications(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'offered'
    CHECK(status IN ('offered','accepted','declined','withdrawn')),
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER
);

-- One standing offer per person per shift: offering twice says nothing new,
-- and withdrawing then offering again should reuse the row rather than leave
-- the commander two of them.
CREATE UNIQUE INDEX idx_volunteer_once ON shift_volunteers(assignment_id, personnel_id);
CREATE INDEX idx_volunteers_status ON shift_volunteers(status, created_at);
