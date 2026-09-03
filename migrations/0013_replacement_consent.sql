-- A named stand-in is a person, not a slot.
--
-- Before this the roster could name somebody as the replacement and put them
-- on the shift without ever asking them — which is how the negotiation ended
-- up happening in the group chat instead, where nothing records it. These two
-- columns are the record of the answer.
ALTER TABLE replacement_requests ADD COLUMN accepted_at INTEGER;
ALTER TABLE replacement_requests ADD COLUMN accepted_by TEXT;
