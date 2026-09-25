ALTER TABLE midi_entries ADD COLUMN IF NOT EXISTS estimated_date DATE;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='midi_entries_estimated_date_matches_year') THEN
        ALTER TABLE midi_entries ADD CONSTRAINT midi_entries_estimated_date_matches_year
            CHECK (estimated_date IS NULL OR estimated_year IS NULL OR EXTRACT(YEAR FROM estimated_date)::INTEGER = estimated_year);
    END IF;
END $$;

ALTER TABLE recovery_events ADD COLUMN IF NOT EXISTS recovered_by_name TEXT
    CHECK (recovered_by_name IS NULL OR octet_length(recovered_by_name) <= 300);
UPDATE recovery_events r SET recovered_by_name=p.display_name
FROM people p WHERE r.recovered_by=p.id AND r.recovered_by_name IS NULL;

ALTER TABLE people ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE people ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS people_updated_at_idx ON people(updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE FUNCTION set_people_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=CURRENT_TIMESTAMP; RETURN NEW; END;
$$;
CREATE TRIGGER people_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION set_people_updated_at();
