ALTER TABLE people ADD COLUMN revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE FUNCTION increment_person_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.revision = OLD.revision + 1;
    RETURN NEW;
END;
$$;
CREATE TRIGGER people_revision BEFORE UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION increment_person_revision();
