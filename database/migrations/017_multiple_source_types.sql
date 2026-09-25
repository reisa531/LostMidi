-- Store selected source types as a canonical comma-separated list while keeping
-- existing single-value records readable by older clients.
ALTER TABLE historical_sources DROP CONSTRAINT IF EXISTS historical_sources_source_type_check;
ALTER TABLE historical_sources ADD CONSTRAINT historical_sources_source_type_check
    CHECK (source_type ~ '^(original_site|forum|mailing_list|archive|search_index|personal_collection|other)(,(original_site|forum|mailing_list|archive|search_index|personal_collection|other))*$');
