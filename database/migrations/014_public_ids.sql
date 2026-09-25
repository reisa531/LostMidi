-- Opaque IDs remain stable if human-readable slugs or bigint internals change.
ALTER TABLE midi_entries ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid();
UPDATE midi_entries SET public_id=gen_random_uuid() WHERE public_id IS NULL;
ALTER TABLE midi_entries ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE midi_entries ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS midi_entries_public_id_idx ON midi_entries(public_id);

ALTER TABLE people ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid();
UPDATE people SET public_id=gen_random_uuid() WHERE public_id IS NULL;
ALTER TABLE people ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE people ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_public_id_idx ON people(public_id);
