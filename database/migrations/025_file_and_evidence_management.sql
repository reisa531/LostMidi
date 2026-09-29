ALTER TABLE admin_change_requests DROP CONSTRAINT IF EXISTS admin_change_requests_request_type_check;
CREATE TABLE midi_private_files (
    file_id BIGINT PRIMARY KEY REFERENCES midi_files(id) ON DELETE CASCADE,
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 20000000)
);
ALTER TABLE admin_change_requests ADD CONSTRAINT admin_change_requests_request_type_check
    CHECK (request_type IN (
        'midi.create','midi.update','midi.delete','midi.restore',
        'person.create','person.update','person.delete','person.restore',
        'credits.update',
        'history.source.create','history.source.update','history.source.delete',
        'history.event.create','history.event.update','history.event.delete',
        'evidence.upload','evidence.delete',
        'file.import','file.visibility','file.delete'
    ));
