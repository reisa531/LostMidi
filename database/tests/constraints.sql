-- Run against an already migrated test database. Everything is rolled back.
-- psql -X -v ON_ERROR_STOP=1 -f database/tests/constraints.sql
BEGIN;
DO $$
DECLARE
    entry_id BIGINT;
    contributor_id BIGINT;
    recovery_id BIGINT;
BEGIN
    INSERT INTO midi_entries (slug, title) VALUES ('schema-constraint-test', 'Constraint test')
        RETURNING id INTO entry_id;
    IF (SELECT revision FROM midi_entries WHERE id = entry_id) <> 1 THEN
        RAISE EXCEPTION 'New entries must start at revision 1';
    END IF;
    UPDATE midi_entries SET title = 'Updated constraint test', revision = 100 WHERE id = entry_id;
    IF (SELECT revision FROM midi_entries WHERE id = entry_id) <> 2 THEN
        RAISE EXCEPTION 'Every update must increment the stored revision exactly once';
    END IF;
    BEGIN
        INSERT INTO admin_sessions (token_hash, credential_id, expires_at)
            VALUES ('raw-session-token', 'constraint-test', CURRENT_TIMESTAMP + INTERVAL '8 hours');
        RAISE EXCEPTION 'Expected invalid session token hash to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    INSERT INTO people (display_name) VALUES ('Constraint test person')
        RETURNING id INTO contributor_id;
    INSERT INTO midi_files (midi_id, original_filename, sha256, file_size, storage_key)
        VALUES (entry_id, 'test.mid', repeat('a', 64), 26, 'test/constraints-first.mid');

    BEGIN
        INSERT INTO midi_files (midi_id, original_filename, sha256, file_size, storage_key)
            VALUES (entry_id, 'duplicate.mid', repeat('a', 64), 26, 'test/constraints-duplicate.mid');
        RAISE EXCEPTION 'Expected duplicate SHA-256 to fail';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO midi_files (midi_id, original_filename, sha256, file_size, storage_key)
            VALUES (entry_id, 'bad.mid', 'invalid', 26, 'test/constraints-bad-hash.mid');
        RAISE EXCEPTION 'Expected invalid SHA-256 to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO midi_files (midi_id, original_filename, sha256, file_size, storage_key)
            VALUES (entry_id, 'empty.mid', repeat('b', 64), 0, 'test/constraints-empty.mid');
        RAISE EXCEPTION 'Expected zero-byte file to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO midi_entries (slug, title, archive_status)
            VALUES ('bad-status-test', 'Invalid status', 'available');
        RAISE EXCEPTION 'Expected invalid archive status to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    INSERT INTO midi_credits (midi_id, person_id, role) VALUES (entry_id, contributor_id, 'composer');
    BEGIN
        DELETE FROM people WHERE id = contributor_id;
        RAISE EXCEPTION 'Expected credited person deletion to fail';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    DELETE FROM midi_credits WHERE midi_id = entry_id;

    INSERT INTO recovery_events (midi_id, recovered_at, recovered_by, story)
        VALUES (entry_id, CURRENT_TIMESTAMP, contributor_id, 'Recovery test')
        RETURNING id INTO recovery_id;
    DELETE FROM people WHERE id = contributor_id;
    IF (SELECT recovered_by FROM recovery_events WHERE id = recovery_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Recovery event must survive contributor removal without dangling attribution';
    END IF;

    DELETE FROM midi_entries WHERE id = entry_id;
    IF EXISTS (SELECT 1 FROM midi_files WHERE midi_id = entry_id)
        OR EXISTS (SELECT 1 FROM recovery_events WHERE id = recovery_id) THEN
        RAISE EXCEPTION 'Entry deletion must remove its dependent metadata';
    END IF;
END;
$$;
ROLLBACK;
\echo Database constraint checks passed (test rows rolled back).
