ALTER TABLE orders ADD COLUMN organization_id UUID;
CREATE INDEX orders_organization_reporting_idx ON orders(organization_id, concert_id, id)
    WHERE organization_id IS NOT NULL;

CREATE FUNCTION attribute_new_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT c.organization_id INTO NEW.organization_id FROM concerts c WHERE c.id = NEW.concert_id;
    RETURN NEW;
END $$;

CREATE TRIGGER orders_capture_organization BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION attribute_new_order();

CREATE TABLE payment_reconciliation (
    intent_id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    provider VARCHAR(20) NOT NULL,
    state VARCHAR(40) NOT NULL,
    requested_amount NUMERIC(12,0) NOT NULL CHECK (requested_amount >= 0),
    transaction_id TEXT,
    collected_amount NUMERIC(12,0) CHECK (collected_amount >= 0),
    attempted_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    refund_amount NUMERIC(12,0) CHECK (refund_amount >= 0),
    refund_reference TEXT,
    changed_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((collected_amount IS NULL) = (verified_at IS NULL)),
    CHECK (collected_amount IS NULL OR transaction_id IS NOT NULL),
    CHECK ((refund_amount IS NULL) = (refund_reference IS NULL))
);
CREATE INDEX payment_reconciliation_attempt_date_idx ON payment_reconciliation(attempted_at);
CREATE INDEX payment_reconciliation_verified_date_idx ON payment_reconciliation(verified_at)
    WHERE verified_at IS NOT NULL;
