-- Receipts commit with the entry and optional file, making uncertain outcomes retryable.
CREATE TABLE midi_creation_requests (
    request_id UUID PRIMARY KEY,
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 COLLATE "C" ~ '^[0-9a-f]{64}$'),
    midi_id BIGINT UNIQUE NOT NULL REFERENCES midi_entries(id) ON DELETE CASCADE
);
