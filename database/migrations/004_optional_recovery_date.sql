-- Historical recovery dates can be unknown; never substitute the record creation time.
ALTER TABLE recovery_events ALTER COLUMN recovered_at DROP NOT NULL;
