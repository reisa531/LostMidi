-- Source types are free-form text labels. Earlier comma-separated values remain valid.
ALTER TABLE historical_sources DROP CONSTRAINT IF EXISTS historical_sources_source_type_check;
ALTER TABLE historical_sources ADD CONSTRAINT historical_sources_source_type_check
    CHECK (octet_length(source_type) BETWEEN 1 AND 2000 AND btrim(source_type) <> '');
