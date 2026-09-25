CREATE TABLE IF NOT EXISTS admin_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL CHECK (request_type IN ('midi.create','midi.update','midi.delete','person.create','person.update','person.delete','credits.update','history.source.create','history.source.update','history.source.delete','history.event.create','history.event.update','history.event.delete','evidence.upload','file.import','midi.restore','person.restore')),
    entity_id BIGINT,
    proposed_by TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','approved','rejected','stale','failed')),
    review_note TEXT,
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((status IN ('pending','reviewing') AND reviewed_at IS NULL AND reviewed_by IS NULL) OR status NOT IN ('pending','reviewing'))
);
CREATE INDEX IF NOT EXISTS admin_change_requests_status_created_idx
    ON admin_change_requests(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_change_requests_actor_created_idx
    ON admin_change_requests(proposed_by, created_at DESC, id DESC);
