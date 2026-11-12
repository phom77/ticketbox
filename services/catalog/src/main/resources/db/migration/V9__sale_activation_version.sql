ALTER TABLE sale_config_outbox ADD COLUMN activation_version BIGINT;

CREATE OR REPLACE FUNCTION publish_sale_config() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    concert UUID;
    activating BOOLEAN := FALSE;
BEGIN
    IF TG_TABLE_NAME = 'concerts' THEN
        concert = COALESCE(NEW.id, OLD.id);
        IF TG_OP = 'UPDATE' THEN
            activating = NEW.organization_id IS NOT NULL AND OLD.status = 'DRAFT' AND NEW.status = 'ON_SALE';
        END IF;
    ELSE
        concert = COALESCE(NEW.concert_id, OLD.concert_id);
    END IF;

    INSERT INTO sale_config_outbox(concert_id, activation_version)
    VALUES (concert, CASE WHEN activating THEN 1 END)
    ON CONFLICT (concert_id) DO UPDATE SET
        version = sale_config_outbox.version + 1,
        activation_version = CASE WHEN activating THEN sale_config_outbox.version + 1
                                  ELSE sale_config_outbox.activation_version END;
    RETURN COALESCE(NEW, OLD);
END $$;
