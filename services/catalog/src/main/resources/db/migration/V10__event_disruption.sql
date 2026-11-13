ALTER TABLE concerts ADD COLUMN sales_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE concerts ADD COLUMN resumed_admission_at TIMESTAMPTZ;

CREATE TABLE event_disruptions (
    id UUID PRIMARY KEY,
    concert_id UUID NOT NULL REFERENCES concerts(id),
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('CANCEL','POSTPONE')),
    reason TEXT NOT NULL,
    actor_id UUID NOT NULL,
    event_date TIMESTAMPTZ,
    doors_open_at TIMESTAMPTZ,
    sale_start_at TIMESTAMPTZ,
    sale_end_at TIMESTAMPTZ,
    pause_version BIGINT NOT NULL,
    dispatched_at TIMESTAMPTZ,
    resume_version BIGINT,
    resumed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX event_disruption_active_idx ON event_disruptions(concert_id) WHERE resume_version IS NULL;

CREATE OR REPLACE FUNCTION publish_sale_config() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    concert UUID;
    activating BOOLEAN := FALSE;
BEGIN
    IF TG_TABLE_NAME = 'concerts' THEN
        concert = COALESCE(NEW.id, OLD.id);
        IF TG_OP = 'UPDATE' THEN
            activating = (NEW.organization_id IS NOT NULL AND OLD.status = 'DRAFT' AND NEW.status = 'ON_SALE')
                OR (OLD.sales_suspended AND NOT NEW.sales_suspended);
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
