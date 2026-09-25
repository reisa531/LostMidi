-- Fast substring search for titles, identifiers, people, aliases and sources.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS midi_entries_title_trgm_idx ON midi_entries USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS midi_entries_slug_trgm_idx ON midi_entries USING GIN (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS people_display_name_trgm_idx ON people USING GIN (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS person_aliases_alias_trgm_idx ON person_aliases USING GIN (alias gin_trgm_ops);
CREATE INDEX IF NOT EXISTS historical_sources_website_name_trgm_idx ON historical_sources USING GIN (website_name gin_trgm_ops);
