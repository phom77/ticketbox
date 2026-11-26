ALTER TABLE tickets ADD COLUMN transferred_from_ticket_id uuid REFERENCES tickets(id);

CREATE TABLE ticket_transfers (
    id uuid PRIMARY KEY,
    ticket_id uuid NOT NULL REFERENCES tickets(id),
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    sender_name text NOT NULL,
    recipient_name text NOT NULL,
    status varchar(12) NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    expires_at timestamptz NOT NULL,
    new_ticket_id uuid REFERENCES tickets(id),
    CHECK (sender_id <> recipient_id),
    CHECK ((status = 'PENDING') = (decided_at IS NULL)),
    CHECK ((status = 'ACCEPTED') = (new_ticket_id IS NOT NULL))
);

CREATE UNIQUE INDEX one_pending_transfer_per_ticket ON ticket_transfers (ticket_id) WHERE status = 'PENDING';
CREATE INDEX ticket_transfers_by_sender ON ticket_transfers (sender_id, created_at DESC);
CREATE INDEX ticket_transfers_by_recipient ON ticket_transfers (recipient_id, created_at DESC);
CREATE INDEX ticket_transfers_pending_expiry ON ticket_transfers (expires_at) WHERE status = 'PENDING';
