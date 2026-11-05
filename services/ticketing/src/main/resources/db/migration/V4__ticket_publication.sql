CREATE TABLE checkin_ticket_outbox(
    ticket_id UUID PRIMARY KEY REFERENCES tickets(id),
    version BIGINT NOT NULL DEFAULT 1,
    delivered_version BIGINT NOT NULL DEFAULT 0
);
CREATE FUNCTION publish_ticket_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO checkin_ticket_outbox(ticket_id) VALUES(NEW.id)
    ON CONFLICT(ticket_id) DO UPDATE SET version=checkin_ticket_outbox.version+1;
    RETURN NEW;
END $$;
CREATE TRIGGER ticket_projection AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION publish_ticket_projection();
INSERT INTO checkin_ticket_outbox(ticket_id) SELECT id FROM tickets;
