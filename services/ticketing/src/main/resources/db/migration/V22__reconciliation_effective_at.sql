-- Reconciliation reads filter and page by indexed columns on the intent: the owning organization and the
-- effective attempt time (the Payment attempt time once reported, otherwise the intent's creation time).
-- Note: the backfill UPDATE and SET NOT NULL below rewrite and lock ticketing_payment_intents for the duration of the
-- migration. That is acceptable at the current table size; revisit with a batched backfill if it grows large.
ALTER TABLE ticketing_payment_intents ADD COLUMN organization_id uuid;
ALTER TABLE ticketing_payment_intents ADD COLUMN effective_at timestamptz;

UPDATE ticketing_payment_intents i
   SET organization_id = (SELECT o.organization_id FROM orders o WHERE o.id = i.order_id),
       effective_at = COALESCE((SELECT p.attempted_at FROM payment_reconciliation p
                                 WHERE p.intent_id = i.intent_id AND p.order_id = i.order_id
                                   AND p.provider = i.provider AND p.requested_amount = i.amount),
                               i.created_at);

ALTER TABLE ticketing_payment_intents ALTER COLUMN effective_at SET NOT NULL;

CREATE FUNCTION initialize_payment_intent_reporting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT o.organization_id INTO NEW.organization_id FROM orders o WHERE o.id = NEW.order_id;
    NEW.effective_at := COALESCE(NEW.effective_at, NEW.created_at);
    RETURN NEW;
END $$;

CREATE TRIGGER payment_intents_reporting BEFORE INSERT ON ticketing_payment_intents
FOR EACH ROW EXECUTE FUNCTION initialize_payment_intent_reporting();

CREATE INDEX payment_intents_organization_effective_idx
    ON ticketing_payment_intents(organization_id, effective_at, intent_id);
CREATE INDEX payment_intents_effective_idx ON ticketing_payment_intents(effective_at, intent_id);
