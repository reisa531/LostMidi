-- Fictional metadata only. No MIDI binary or unverified physical-file record is supplied.
-- Executed once by migrate.sh only when SEED_DEMO=true.
INSERT INTO people (display_name, biography) VALUES
    ('Mira Pixel (fictional)', 'A fictional MIDI sequencer created for this development fixture.'),
    ('Rowan Archive (fictional)', 'A fictional contributor used to demonstrate recovery attribution.');

INSERT INTO person_aliases (person_id, alias)
SELECT id, 'pixel-lantern-demo' FROM people WHERE display_name = 'Mira Pixel (fictional)';
INSERT INTO person_aliases (person_id, alias)
SELECT id, 'rowan-demo' FROM people WHERE display_name = 'Rowan Archive (fictional)';

INSERT INTO midi_entries
    (slug, title, description, estimated_year, archive_status, distribution_permission)
VALUES
    ('example-midi', 'Paper Observatory (fictional)',
     'A fictional archive record about a melody once described on an imaginary personal website. All dates, names and recovery stories are sample data; no playable MIDI is supplied.',
     1998, 'partially_recovered', 'metadata_only'),
    ('clockwork-tide', 'Clockwork Tide (fictional)',
     'A fictional missing MIDI used to demonstrate an archive entry with historical metadata and no recovered file.',
     2001, 'lost', 'metadata_only'),
    ('lantern-map', 'Lantern Map (fictional)',
     'A fictional listing with an uncertain date and attribution. This record deliberately leaves some fields empty.',
     NULL, 'uncertain', 'metadata_only');

INSERT INTO midi_credits (midi_id, person_id, role)
SELECT m.id, p.id, 'sequencer'
FROM midi_entries m CROSS JOIN people p
WHERE m.slug IN ('example-midi', 'clockwork-tide')
  AND p.display_name = 'Mira Pixel (fictional)';

INSERT INTO midi_credits (midi_id, person_id, role)
SELECT m.id, p.id, 'contributor'
FROM midi_entries m CROSS JOIN people p
WHERE m.slug = 'example-midi' AND p.display_name = 'Rowan Archive (fictional)';

INSERT INTO historical_sources
    (midi_id, website_name, original_url, first_seen_at, last_seen_at, wayback_url, notes)
SELECT id, 'The Imaginary MIDI Attic', 'https://example.invalid/midi/paper-observatory.mid',
       '1998-06-01T00:00:00Z', '2002-01-01T00:00:00Z', NULL,
       'Fictional source. example.invalid is intentionally not a real historical website. No Wayback capture is claimed.'
FROM midi_entries WHERE slug = 'example-midi';

INSERT INTO historical_sources (midi_id, website_name, original_url, notes)
SELECT id, 'Fictional Clockwork Music Directory', 'https://example.invalid/clockwork/',
       'Invented directory reference for a missing-file example.'
FROM midi_entries WHERE slug = 'clockwork-tide';

INSERT INTO recovery_events (midi_id, recovered_at, recovered_by, story, evidence)
SELECT m.id, '2024-02-12T00:00:00Z', p.id,
       'Fictional demonstration: a contributor found a text listing in an imaginary backup and recovered the title and alias. The MIDI binary remains missing.',
       'Demo narrative only; no physical backup, screenshot or binary evidence is supplied.'
FROM midi_entries m CROSS JOIN people p
WHERE m.slug = 'example-midi' AND p.display_name = 'Rowan Archive (fictional)';
