CREATE TABLE checkin_refund_cases (
    id UUID PRIMARY KEY,
    ticket_ids UUID[] NOT NULL,
    state VARCHAR(12) NOT NULL CHECK (state IN ('PENDING', 'HELD', 'RELEASED'))
);

ALTER TABLE tickets ADD COLUMN refund_case_id UUID REFERENCES checkin_refund_cases(id);
CREATE INDEX tickets_refund_case_idx ON tickets(refund_case_id) WHERE refund_case_id IS NOT NULL;
