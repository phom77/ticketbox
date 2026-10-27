ALTER TABLE guest_lists
    ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS checkin_gate VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_guest_lists_concert_checked_in
    ON guest_lists(concert_id, checked_in_at);
