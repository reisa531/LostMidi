CREATE TABLE registration_captchas (
    id TEXT PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
    answer_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '5 minutes'
);
CREATE INDEX registration_captchas_expires_idx ON registration_captchas(expires_at);

ALTER TABLE admin_user_audit DROP CONSTRAINT IF EXISTS admin_user_audit_action_check;
ALTER TABLE admin_user_audit ADD CONSTRAINT admin_user_audit_action_check
    CHECK (action IN ('invite','accept_invite','role_changed','disabled','registered','deleted'));
