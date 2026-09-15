-- Requirement R1: read-only pre-release check for known demo/test records.
-- Run on the intended production database after migrations. Never deletes data.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM midi_entries
        WHERE slug IN ('example-midi', 'clockwork-tide', 'lantern-map')
           OR slug LIKE 'admin-check-%' OR slug LIKE 'repository-test-%'
           OR title ILIKE '%(fictional)%'
    ) OR EXISTS (
        SELECT 1 FROM people
        WHERE display_name IN ('Mira Pixel (fictional)', 'Rowan Archive (fictional)')
    ) THEN
        RAISE EXCEPTION 'Possible demo/test records remain. Review the target database before production release; no data was changed.';
    END IF;
END;
$$;
ROLLBACK;
\echo No known demo/test markers found. Manually review archive content before release.
