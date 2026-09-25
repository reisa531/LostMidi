UPDATE midi_entries SET archive_status='lost' WHERE archive_status='uncertain';
ALTER TABLE midi_entries DROP CONSTRAINT IF EXISTS midi_entries_archive_status_check;
UPDATE midi_entries SET archive_status='verifying' WHERE archive_status='partially_recovered';
ALTER TABLE midi_entries ALTER COLUMN archive_status SET DEFAULT 'lost';
ALTER TABLE midi_entries ADD CONSTRAINT midi_entries_archive_status_check
    CHECK (archive_status IN ('lost','verifying','archived'));

-- The optional historical demo seed still uses its original labels; preserve
-- its checksum while normalizing those rows to the current three-state model.
CREATE OR REPLACE FUNCTION normalize_legacy_archive_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.archive_status = 'uncertain' THEN NEW.archive_status := 'lost'; END IF;
    IF NEW.archive_status = 'partially_recovered' THEN NEW.archive_status := 'verifying'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER midi_entries_normalize_legacy_archive_status
    BEFORE INSERT ON midi_entries FOR EACH ROW EXECUTE FUNCTION normalize_legacy_archive_status();

ALTER TABLE admin_users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX admin_users_email_unique ON admin_users (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_email_valid
    CHECK (email IS NULL OR (length(email) <= 254 AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
ALTER TABLE admin_user_audit DROP CONSTRAINT IF EXISTS admin_user_audit_action_check;
ALTER TABLE admin_user_audit ADD CONSTRAINT admin_user_audit_action_check
    CHECK (action IN ('invite','accept_invite','role_changed','disabled','registered'));
ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
    CHECK (action IN ('delete','restore','purge'));
ALTER TABLE admin_change_requests ADD COLUMN entity_public_id UUID;
UPDATE admin_change_requests AS request SET entity_public_id=entry.public_id
FROM midi_entries AS entry
WHERE request.entity_id=entry.id AND request.request_type NOT LIKE 'person.%';
UPDATE admin_change_requests AS request SET entity_public_id=person.public_id
FROM people AS person
WHERE request.entity_id=person.id AND request.request_type LIKE 'person.%';

-- All application-created records take the lowest unoccupied positive number.
-- The transaction lock serializes concurrent allocations and purges.
CREATE OR REPLACE FUNCTION allocate_archive_id(kind TEXT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE result BIGINT;
BEGIN
    IF kind = 'midi' THEN
        PERFORM pg_advisory_xact_lock(741035, 1);
        SELECT MIN(candidate) INTO result FROM
            (SELECT 1::bigint AS candidate UNION ALL SELECT id + 1 FROM midi_entries WHERE id < 9223372036854775807) AS candidates
            WHERE NOT EXISTS (SELECT 1 FROM midi_entries WHERE id = candidate);
    ELSIF kind = 'person' THEN
        PERFORM pg_advisory_xact_lock(741035, 2);
        SELECT MIN(candidate) INTO result FROM
            (SELECT 1::bigint AS candidate UNION ALL SELECT id + 1 FROM people WHERE id < 9223372036854775807) AS candidates
            WHERE NOT EXISTS (SELECT 1 FROM people WHERE id = candidate);
    ELSE
        RAISE EXCEPTION 'Unknown archive kind';
    END IF;
    RETURN result;
END;
$$;
