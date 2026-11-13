ALTER TABLE order_events DROP CONSTRAINT order_events_check;
ALTER TABLE order_events ADD CONSTRAINT order_events_check CHECK (
    (stream_version = 1 AND event_type IN ('OrderCreated', 'OrderImported')) OR
    (stream_version > 1 AND event_type IN ('OrderPaymentInitiated', 'OrderPaid', 'OrderExpired', 'OrderCancelled', 'OrderRefunded'))
);

CREATE TABLE order_refunds (
    case_id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    ticket_ids UUID[] NOT NULL,
    state VARCHAR(12) NOT NULL CHECK (state IN ('PREPARED', 'CONFIRMED', 'ABORTED')),
    compensation BOOLEAN NOT NULL,
    external_reference TEXT
);

CREATE FUNCTION protect_prepared_refund_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('CANCELLED','TRANSFERRED') AND OLD.status <> NEW.status AND EXISTS (
        SELECT 1 FROM order_refunds WHERE state='PREPARED' AND OLD.id=ANY(ticket_ids)
    ) THEN
        RAISE EXCEPTION 'Ticket is reserved for a refund decision' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER tickets_protect_refund_hold BEFORE UPDATE OF status ON tickets
    FOR EACH ROW EXECUTE FUNCTION protect_prepared_refund_ticket();
