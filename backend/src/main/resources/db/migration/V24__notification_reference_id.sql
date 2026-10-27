ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS reference_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_reference
    ON notifications(reference_id);
