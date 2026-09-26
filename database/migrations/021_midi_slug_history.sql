-- Keep every previous public MIDI address reachable after a slug change.
CREATE TABLE midi_slug_history (
    slug TEXT PRIMARY KEY,
    midi_id BIGINT NOT NULL REFERENCES midi_entries(id) ON DELETE CASCADE,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX midi_slug_history_midi_idx ON midi_slug_history (midi_id);

CREATE FUNCTION guard_midi_slug_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM midi_slug_history WHERE slug = NEW.slug AND midi_id <> NEW.id) THEN
        RAISE EXCEPTION 'Slug is reserved by another archive' USING ERRCODE = '23505', CONSTRAINT = 'midi_slug_history_pkey';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_midi_slug_history BEFORE INSERT OR UPDATE OF slug ON midi_entries
FOR EACH ROW EXECUTE FUNCTION guard_midi_slug_history();

CREATE FUNCTION remember_midi_slug() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.slug IS DISTINCT FROM NEW.slug THEN
        INSERT INTO midi_slug_history (slug, midi_id) VALUES (OLD.slug, NEW.id)
        ON CONFLICT (slug) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER remember_midi_slug AFTER UPDATE OF slug ON midi_entries
FOR EACH ROW EXECUTE FUNCTION remember_midi_slug();
