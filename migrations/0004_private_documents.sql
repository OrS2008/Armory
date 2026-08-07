CREATE TABLE private_documents (
  object_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 3000000),
  content BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
