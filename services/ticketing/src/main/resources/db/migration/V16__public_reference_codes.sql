CREATE SEQUENCE order_reference_code_seq AS bigint START WITH 10000000;
CREATE SEQUENCE ticket_reference_code_seq AS bigint START WITH 10000000;

ALTER TABLE orders ADD COLUMN reference_code varchar(32);
ALTER TABLE orders ALTER COLUMN reference_code SET DEFAULT ('DH-' || nextval('order_reference_code_seq'));
UPDATE orders SET reference_code = DEFAULT;
ALTER TABLE orders ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_reference_code_unique UNIQUE (reference_code);

ALTER TABLE tickets ADD COLUMN reference_code varchar(32);
ALTER TABLE tickets ALTER COLUMN reference_code SET DEFAULT ('VE-' || nextval('ticket_reference_code_seq'));
-- The existing projection trigger republishes issued tickets with their new reference.
UPDATE tickets SET reference_code = DEFAULT;
ALTER TABLE tickets ALTER COLUMN reference_code SET NOT NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_reference_code_unique UNIQUE (reference_code);
