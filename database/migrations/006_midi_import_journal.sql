-- Track only objects written by the managed import workflow, not arbitrary bucket contents.
-- Separate committed journal entries survive a later database rollback or process termination.
CREATE TABLE midi_import_objects (
    sha256 TEXT PRIMARY KEY CHECK (sha256 COLLATE "C" ~ '^[0-9a-f]{64}$'),
    -- Equality to the primary key already guarantees uniqueness. A redundant
    -- UNIQUE index can race with ON CONFLICT(sha256) during concurrent retries.
    storage_key TEXT NOT NULL CHECK (storage_key = sha256),
    touched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX midi_import_objects_touched_at_idx ON midi_import_objects(touched_at);
ALTER TABLE midi_files ADD COLUMN private_archive_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
