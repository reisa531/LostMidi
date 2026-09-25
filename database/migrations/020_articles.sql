CREATE TABLE articles (
    public_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND octet_length(title) <= 300),
    body_markdown TEXT NOT NULL CHECK (length(btrim(body_markdown)) > 0 AND octet_length(body_markdown) <= 100000),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    author_username TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE article_midis (
    article_id UUID NOT NULL REFERENCES articles(public_id) ON DELETE CASCADE,
    midi_id BIGINT NOT NULL REFERENCES midi_entries(id) ON DELETE RESTRICT,
    PRIMARY KEY (article_id, midi_id)
);
CREATE INDEX article_midis_midi_idx ON article_midis (midi_id, article_id);
CREATE TABLE article_people (
    article_id UUID NOT NULL REFERENCES articles(public_id) ON DELETE CASCADE,
    person_id BIGINT NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
    PRIMARY KEY (article_id, person_id)
);
CREATE INDEX article_people_person_idx ON article_people (person_id, article_id);
CREATE INDEX articles_published_idx ON articles (updated_at DESC, public_id) WHERE status='published';

CREATE FUNCTION touch_article() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER articles_touch BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION touch_article();
