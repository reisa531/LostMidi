CREATE TABLE file_uploads (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES admin_users(username) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_at TIMESTAMPTZ,
    completed_response JSONB
);
CREATE INDEX file_uploads_created_at_idx ON file_uploads(created_at);

CREATE TABLE file_upload_chunks (
    upload_id UUID NOT NULL REFERENCES file_uploads(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 9),
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2000000),
    PRIMARY KEY (upload_id, chunk_index)
);
