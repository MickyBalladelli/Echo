PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS poll_options_migration;

CREATE TABLE poll_options_migration (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || '8' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  poll_id TEXT NOT NULL REFERENCES post_polls(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  position SMALLINT NOT NULL,
  UNIQUE (poll_id, position)
);

INSERT INTO poll_options_migration (id, poll_id, label, position)
SELECT id, poll_id, label, position
FROM poll_options;

DROP TABLE poll_options;
ALTER TABLE poll_options_migration RENAME TO poll_options;

PRAGMA foreign_keys = ON;
