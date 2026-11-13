ALTER TABLE concerts ADD COLUMN sales_suspended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE event_disruptions (
    id UUID PRIMARY KEY,
    concert_id UUID NOT NULL,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('CANCEL','POSTPONE')),
    reason TEXT NOT NULL,
    actor_id UUID NOT NULL,
    event_date TIMESTAMPTZ,
    cutoff_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE event_disruption_notices (
    operation_id UUID NOT NULL REFERENCES event_disruptions(id),
    user_id UUID NOT NULL,
    PRIMARY KEY(operation_id,user_id)
);

CREATE TABLE event_disruption_refunds (
    operation_id UUID NOT NULL REFERENCES event_disruptions(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(operation_id,order_id)
);
