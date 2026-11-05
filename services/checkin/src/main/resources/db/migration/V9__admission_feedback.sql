CREATE TABLE admission_outbox (
    ticket_id UUID PRIMARY KEY REFERENCES checkin_logs(ticket_id),
    delivered BOOLEAN NOT NULL DEFAULT false
);
CREATE FUNCTION publish_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO admission_outbox(ticket_id) VALUES(NEW.ticket_id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER accepted_admission AFTER INSERT ON checkin_logs
FOR EACH ROW EXECUTE FUNCTION publish_admission();
INSERT INTO admission_outbox(ticket_id) SELECT ticket_id FROM checkin_logs;
