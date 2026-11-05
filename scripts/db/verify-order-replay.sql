-- Run with psql -v ON_ERROR_STOP=1 -f scripts/db/verify-order-replay.sql
BEGIN ISOLATION LEVEL REPEATABLE READ;

CREATE TEMP TABLE replayed_orders ON COMMIT DROP AS
SELECT stream.order_id, replay_order(stream.order_id) AS state
FROM (SELECT DISTINCT order_id FROM order_events) stream;

-- updated_at is projection metadata. Normalize equivalent timestamp encodings
-- before comparing JSON, since PostgreSQL and Java may use different offsets.
CREATE TEMP TABLE order_replay_mismatches ON COMMIT DROP AS
SELECT COALESCE(o.id, r.order_id) AS order_id
FROM orders o
FULL JOIN replayed_orders r ON o.id = r.order_id
WHERE o.id IS NULL OR r.order_id IS NULL
   OR (r.state - 'updated_at' - 'paid_at')
        IS DISTINCT FROM (order_projection_snapshot(o.id) - 'updated_at' - 'paid_at')
   OR CAST(r.state ->> 'paid_at' AS timestamptz) IS DISTINCT FROM o.paid_at;

SELECT * FROM order_replay_mismatches ORDER BY order_id;

DO $$ BEGIN
    IF EXISTS (SELECT FROM order_replay_mismatches) THEN
        RAISE EXCEPTION 'Order replay diverges from the current projection';
    END IF;
END $$;

SELECT count(*) AS verified_orders FROM replayed_orders;
ROLLBACK;
