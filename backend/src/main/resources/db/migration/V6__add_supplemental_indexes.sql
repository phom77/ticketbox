CREATE INDEX idx_checkin_logs_concert_checked_at
    ON checkin_logs(concert_id, checked_at DESC);

CREATE INDEX idx_tickets_concert_status
    ON tickets(concert_id, status);
