-- One durable installation marker also holds the public site configuration.
-- Environment upgrades deliberately never copy deployment credentials here.
CREATE TABLE site_installation (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    site_name TEXT NOT NULL CHECK (octet_length(site_name) BETWEEN 1 AND 200 AND btrim(site_name) <> ''),
    site_description TEXT NOT NULL CHECK (octet_length(site_description) <= 1000),
    auth_source TEXT NOT NULL CHECK (auth_source IN ('environment', 'database')),
    username TEXT,
    password_hash TEXT,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT site_installation_credentials CHECK (
        (auth_source = 'environment' AND username IS NULL AND password_hash IS NULL)
        OR
        (auth_source = 'database' AND username IS NOT NULL AND password_hash IS NOT NULL
            AND username COLLATE "C" ~ '^[A-Za-z0-9_.-]{3,64}$'
            AND password_hash COLLATE "C" ~ '^pbkdf2_sha256:600000:[0-9a-f]{32}:[0-9a-f]{64}$')
    )
);
