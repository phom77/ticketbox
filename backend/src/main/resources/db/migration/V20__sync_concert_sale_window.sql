-- Sale windows belong to the concert. Keep legacy ticket-type columns aligned
-- for old seed scripts and existing database compatibility during the reset.
UPDATE concerts c
SET sale_start_at = COALESCE((
        SELECT MIN(tt.sale_start_at) FROM ticket_types tt WHERE tt.concert_id = c.id
    ), c.sale_start_at),
    sale_end_at = (
        SELECT MAX(tt.sale_end_at) FROM ticket_types tt WHERE tt.concert_id = c.id
    );

UPDATE ticket_types tt
SET sale_start_at = c.sale_start_at,
    sale_end_at = c.sale_end_at
FROM concerts c
WHERE c.id = tt.concert_id;

DROP INDEX IF EXISTS idx_ticket_types_sale_window;
ALTER TABLE ticket_types
    DROP COLUMN sale_start_at,
    DROP COLUMN sale_end_at;
