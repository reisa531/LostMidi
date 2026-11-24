-- Keep legacy deployments on their restricted role during the cutover.
ALTER TABLE admin_users ADD COLUMN member_role text NOT NULL DEFAULT 'maintainer'
    CHECK (member_role IN ('owner','admin','maintainer'));
UPDATE admin_users SET member_role = CASE
    WHEN username = (SELECT username FROM admin_users WHERE status='active' AND role='super_admin'
        ORDER BY (username='dzhes') DESC, created_at,id LIMIT 1) THEN 'owner'
    WHEN role='super_admin' THEN 'admin' ELSE 'maintainer' END;
CREATE UNIQUE INDEX admin_users_single_owner ON admin_users(member_role) WHERE member_role='owner';
ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'admin';
UPDATE admin_users SET role='admin' WHERE member_role <> 'owner';

CREATE TABLE front_desk (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    revision integer NOT NULL DEFAULT 1,
    slides jsonb NOT NULL DEFAULT '[{"title":"寻回记录","href":"/recovery"},{"title":"档案文章","href":"/articles"}]',
    sayings jsonb NOT NULL DEFAULT '["老曲子不怕过时，只要还有人肯点开听一遍。（AI 生成）","几 KB 的 MIDI 里，装着好些人整个童年的下午。（AI 生成）"]'
);
INSERT INTO front_desk DEFAULT VALUES;
CREATE TABLE announcements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL, body text NOT NULL, author text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE listening_assets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    midi_id bigint NOT NULL REFERENCES midi_entries(id) ON DELETE CASCADE,
    filename text NOT NULL, mime text NOT NULL CHECK (mime IN ('audio/midi','audio/mpeg','image/webp')),
    content bytea NOT NULL CHECK (octet_length(content)>0),
    provenance text NOT NULL,
    source_hash text NOT NULL,
    UNIQUE(midi_id, filename)
);
