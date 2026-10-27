-- Cutover requires draining old writers. PostgreSQL locks protect the backfill;
-- the legacy-write trigger fences old binaries after this migration commits.
LOCK TABLE ticket_types IN ACCESS EXCLUSIVE MODE;
CREATE TABLE ticket_inventory (
    ticket_type_id UUID PRIMARY KEY REFERENCES ticket_types(id) ON DELETE CASCADE,
    total_quantity INT NOT NULL CHECK (total_quantity>0),
    available_qty INT NOT NULL CHECK (available_qty>=0 AND available_qty<=total_quantity),
    active BOOLEAN NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active)
SELECT id,total_quantity,available_qty,is_active FROM ticket_types;
ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS chk_ticket_types_available_lte_total;
CREATE FUNCTION initialize_ticket_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active)
  VALUES(NEW.id,NEW.total_quantity,NEW.available_qty,NEW.is_active);
  RETURN NEW;
END $$;
CREATE TRIGGER initialize_ticket_inventory AFTER INSERT ON ticket_types
FOR EACH ROW EXECUTE FUNCTION initialize_ticket_inventory();
CREATE FUNCTION reject_legacy_inventory_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.available_qty IS DISTINCT FROM OLD.available_qty THEN
    RAISE EXCEPTION 'Stock ownership moved to Ticketing; legacy writer is fenced';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fence_legacy_inventory BEFORE UPDATE ON ticket_types
FOR EACH ROW EXECUTE FUNCTION reject_legacy_inventory_write();
COMMENT ON COLUMN ticket_types.available_qty IS 'Frozen migration snapshot; operational reads and writes use ticket_inventory';
