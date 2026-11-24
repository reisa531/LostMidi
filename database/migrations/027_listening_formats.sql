CREATE FUNCTION listening_mime(filename text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE lower(substring(filename from '\.([^.]+)$'))
    WHEN 'mid' THEN 'audio/midi' WHEN 'midi' THEN 'audio/midi'
    WHEN 'mp3' THEN 'audio/mpeg' WHEN 'wav' THEN 'audio/wav'
    WHEN 'flac' THEN 'audio/flac' WHEN 'ogg' THEN 'audio/ogg'
    WHEN 'opus' THEN 'audio/ogg' WHEN 'm4a' THEN 'audio/mp4'
    WHEN 'aac' THEN 'audio/aac' WHEN 'webm' THEN 'audio/webm'
  END
$$;
