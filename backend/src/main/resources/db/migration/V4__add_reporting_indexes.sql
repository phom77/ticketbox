CREATE INDEX idx_concerts_created_by_status_event_date
    ON concerts(created_by, status, event_date);

CREATE INDEX idx_orders_concert_status_paid_at
    ON orders(concert_id, status, paid_at);
