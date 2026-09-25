ALTER TABLE midi_import_objects ADD COLUMN IF NOT EXISTS cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0);
ALTER TABLE midi_import_objects ADD COLUMN IF NOT EXISTS last_cleanup_attempt_at TIMESTAMPTZ;
ALTER TABLE midi_import_objects ADD COLUMN IF NOT EXISTS last_cleanup_error TEXT;
