-- Preserve request identities so delayed creation retries cannot resurrect deleted entries.
ALTER TABLE midi_creation_requests ALTER COLUMN midi_id DROP NOT NULL;
ALTER TABLE midi_creation_requests DROP CONSTRAINT midi_creation_requests_midi_id_fkey;
ALTER TABLE midi_creation_requests ADD CONSTRAINT midi_creation_requests_midi_id_fkey
    FOREIGN KEY (midi_id) REFERENCES midi_entries(id) ON DELETE SET NULL;
