-- Run against an already migrated test database. Everything is rolled back.
-- psql -X -v ON_ERROR_STOP=1 -f database/tests/constraints.sql
BEGIN;
DO $$
DECLARE
    entry_id BIGINT;
    contributor_id BIGINT;
    recovery_id BIGINT;
    article_id UUID;
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
    IF (SELECT revision FROM people WHERE id = contributor_id) <> 1 THEN
        RAISE EXCEPTION 'New people must start at revision 1';
    END IF;
    UPDATE people SET biography = 'Revision check', revision = 100 WHERE id = contributor_id;
    IF (SELECT revision FROM people WHERE id = contributor_id) <> 2 THEN
        RAISE EXCEPTION 'Person update must increment the stored revision exactly once';
    END IF;
    BEGIN
        INSERT INTO people (display_name, revision) VALUES ('Invalid revision', 0);
        RAISE EXCEPTION 'Expected non-positive person revision to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
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

    INSERT INTO historical_sources (midi_id, website_name, first_seen_at, last_seen_at)
        VALUES (entry_id, 'Known historical site', '1999-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
    BEGIN
        INSERT INTO historical_sources (midi_id, website_name, first_seen_at, last_seen_at)
            VALUES (entry_id, 'Bad chronology', '2000-01-01T00:00:00.000001Z', '2000-01-01T00:00:00Z');
        RAISE EXCEPTION 'Expected reversed source dates to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    -- Unknown date is real domain information, not the insertion timestamp.
    INSERT INTO recovery_events (midi_id, recovered_at, recovered_by, story)
        VALUES (entry_id, NULL, contributor_id, 'Recovery test')
        RETURNING id INTO recovery_id;
    IF (SELECT recovered_at FROM recovery_events WHERE id = recovery_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Unknown recovery dates must remain null';
    END IF;
    DELETE FROM people WHERE id = contributor_id;
    IF (SELECT recovered_by FROM recovery_events WHERE id = recovery_id) IS NOT NULL THEN
        RAISE EXCEPTION 'Recovery event must survive contributor removal without dangling attribution';
    END IF;

    INSERT INTO articles(title,body_markdown,status,author_username)
        VALUES ('Test article','# Markdown body','published','constraint-test') RETURNING public_id INTO article_id;
    INSERT INTO article_midis(article_id,midi_id) VALUES(article_id,entry_id);
    UPDATE articles SET title='Updated article' WHERE public_id=article_id;
    IF (SELECT revision FROM articles WHERE public_id=article_id) <> 2 THEN
        RAISE EXCEPTION 'Article update must increment its revision';
    END IF;
    BEGIN
        DELETE FROM midi_entries WHERE id=entry_id;
        RAISE EXCEPTION 'Related MIDI cannot be purged while an article references it';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    DELETE FROM articles WHERE public_id=article_id;

    DELETE FROM midi_entries WHERE id = entry_id;
    IF EXISTS (SELECT 1 FROM midi_files WHERE midi_id = entry_id)
        OR EXISTS (SELECT 1 FROM historical_sources WHERE midi_id = entry_id)
        OR EXISTS (SELECT 1 FROM recovery_events WHERE id = recovery_id) THEN
        RAISE EXCEPTION 'Entry deletion must remove its dependent metadata';
    END IF;
END;
$$;
-- Clone constraints, not rows: installation checks never modify a real installation marker.
CREATE TEMP TABLE installation_constraint_test (LIKE site_installation INCLUDING ALL) ON COMMIT DROP;
DO $$
DECLARE
    fixture_hash TEXT := 'pbkdf2_sha256:600000:' || repeat('0',32) || ':' || repeat('0',64);
BEGIN
    BEGIN
        INSERT INTO installation_constraint_test(id,site_name,site_description,auth_source)
            VALUES(2,'Archive','','environment');
        RAISE EXCEPTION 'Expected non-singleton installation id to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
            VALUES('   ','','environment');
        RAISE EXCEPTION 'Expected empty site name to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
            VALUES(repeat('档',67),'','environment');
        RAISE EXCEPTION 'Expected site name over 200 UTF8 bytes to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
            VALUES('Archive',repeat('x',1001),'environment');
        RAISE EXCEPTION 'Expected site description over 1000 bytes to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
            VALUES('Archive','','other');
        RAISE EXCEPTION 'Expected unknown authentication source to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username,password_hash)
            VALUES('Archive','','environment','admin',fixture_hash);
        RAISE EXCEPTION 'Expected environment credentials in DB to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
            VALUES('Archive','','database');
        RAISE EXCEPTION 'Expected absent database credentials to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username)
            VALUES('Archive','','database','admin');
        RAISE EXCEPTION 'Expected missing password hash to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,password_hash)
            VALUES('Archive','','database',fixture_hash);
        RAISE EXCEPTION 'Expected missing username to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username,password_hash)
            VALUES('Archive','','database','用户',fixture_hash);
        RAISE EXCEPTION 'Expected non-ASCII username to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username,password_hash)
            VALUES('Archive','','database','admin','plaintext');
        RAISE EXCEPTION 'Expected invalid password hash to fail';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    INSERT INTO installation_constraint_test(site_name,site_description,auth_source)
        VALUES('Archive','','environment');
    IF (SELECT installed_at IS NULL FROM installation_constraint_test) THEN
        RAISE EXCEPTION 'Expected installation timestamp';
    END IF;
    BEGIN
        INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username,password_hash)
            VALUES('Another archive','','database','admin',fixture_hash);
        RAISE EXCEPTION 'Expected second installation to fail';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    DELETE FROM installation_constraint_test;
    INSERT INTO installation_constraint_test(site_name,site_description,auth_source,username,password_hash)
        VALUES('Database archive','','database','admin',fixture_hash);
END;
$$;
ROLLBACK;
\echo Database constraint checks passed (test rows rolled back).
