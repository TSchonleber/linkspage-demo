-- Pages table: one row per published link-in-bio page.
-- `data` holds the JSON-serialized Pydantic Page; keeping it opaque lets
-- us evolve the Page schema without ALTER TABLE churn during the demo.
CREATE TABLE IF NOT EXISTS pages (
  slug          TEXT PRIMARY KEY,
  edit_token_h  TEXT NOT NULL,
  data          TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  view_count    INTEGER NOT NULL DEFAULT 0
);

-- Useful for ops queries ("most recently updated pages"); cheap to maintain.
CREATE INDEX IF NOT EXISTS pages_updated_at ON pages(updated_at);
