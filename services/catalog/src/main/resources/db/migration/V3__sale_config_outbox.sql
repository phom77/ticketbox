CREATE TABLE sale_config_outbox (
    concert_id UUID PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 1,
    ticketing_version BIGINT NOT NULL DEFAULT 0,
    checkin_version BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE catalog_availability (
    ticket_type_id UUID PRIMARY KEY REFERENCES ticket_types(id) ON DELETE CASCADE,
    available_qty INTEGER NOT NULL CHECK(available_qty >= 0)
);

CREATE FUNCTION publish_sale_config() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE concert UUID;
BEGIN
    IF TG_TABLE_NAME='concerts' THEN
        concert=COALESCE(NEW.id,OLD.id);
    ELSE
        concert=COALESCE(NEW.concert_id,OLD.concert_id);
    END IF;
    INSERT INTO sale_config_outbox(concert_id) VALUES(concert)
    ON CONFLICT(concert_id) DO UPDATE SET version=sale_config_outbox.version+1;
    RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER concert_configuration AFTER INSERT OR UPDATE OR DELETE ON concerts
FOR EACH ROW EXECUTE FUNCTION publish_sale_config();
CREATE TRIGGER ticket_type_configuration AFTER INSERT OR UPDATE OR DELETE ON ticket_types
FOR EACH ROW EXECUTE FUNCTION publish_sale_config();

CREATE FUNCTION restrict_sale_edits() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state TEXT;
BEGIN
    SELECT status INTO state FROM concerts WHERE id=COALESCE(NEW.concert_id,OLD.concert_id) FOR UPDATE;
    IF state IS DISTINCT FROM 'DRAFT' THEN
        IF TG_OP='UPDATE' AND
           (to_jsonb(NEW)-'is_active'-'updated_at')=(to_jsonb(OLD)-'is_active'-'updated_at') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Price, quantity and ticket types can be edited only while the concert is DRAFT';
    END IF;
    RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER sale_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON ticket_types
FOR EACH ROW EXECUTE FUNCTION restrict_sale_edits();
INSERT INTO sale_config_outbox(concert_id) SELECT id FROM concerts;
