CREATE TABLE purchase_guards (
    user_id UUID NOT NULL REFERENCES users(id),
    concert_id UUID NOT NULL REFERENCES concerts(id),
    PRIMARY KEY(user_id,concert_id)
);
ALTER TABLE ticket_holds ADD COLUMN session_token VARCHAR(255);
CREATE INDEX ticket_hold_expiry_idx ON ticket_holds(expires_at,user_id,concert_id);
ALTER TABLE ticket_holds ADD CONSTRAINT ticket_hold_quantity_positive CHECK (quantity > 0);
CREATE INDEX order_user_status_idx ON orders(user_id,status);
CREATE INDEX order_item_ticket_order_idx ON order_items(ticket_type_id,order_id);
