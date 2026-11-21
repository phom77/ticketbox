DROP INDEX one_ga_group_per_section;
CREATE UNIQUE INDEX one_ga_group_per_section ON performance_groups(performance_id, section_id)
    WHERE kind = 'GA' AND section_id IS NOT NULL;

CREATE TABLE performance_holds (
    id uuid PRIMARY KEY,
    performance_id uuid NOT NULL REFERENCES performance_sales(id),
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    version bigint NOT NULL CHECK (version >= 1),
    expires_at timestamptz,
    UNIQUE (performance_id, user_id),
    UNIQUE (performance_id, id)
);
CREATE INDEX performance_holds_by_expiry ON performance_holds(expires_at, performance_id, user_id)
    WHERE expires_at IS NOT NULL;

CREATE TABLE performance_hold_items (
    hold_id uuid NOT NULL,
    performance_id uuid NOT NULL,
    position integer NOT NULL CHECK (position >= 0),
    offer_id uuid NOT NULL,
    group_id uuid NOT NULL,
    seat_id uuid,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(12,0) NOT NULL CHECK (unit_price > 0),
    offer_name text NOT NULL,
    section_label text NOT NULL,
    row_label text,
    seat_label text,
    PRIMARY KEY (hold_id, position),
    FOREIGN KEY (performance_id, hold_id) REFERENCES performance_holds(performance_id, id),
    FOREIGN KEY (performance_id, offer_id) REFERENCES performance_offers(performance_id, id),
    FOREIGN KEY (performance_id, group_id) REFERENCES performance_groups(performance_id, id),
    FOREIGN KEY (performance_id, seat_id) REFERENCES performance_seats(performance_id, id),
    CHECK (seat_id IS NULL OR quantity = 1)
);

ALTER TABLE orders ADD COLUMN performance_event_id uuid;
ALTER TABLE orders ADD COLUMN performance_title text;
ALTER TABLE orders ADD COLUMN performance_venue_name text;
ALTER TABLE orders ADD COLUMN performance_starts_at timestamptz;
ALTER TABLE orders ADD COLUMN performance_hold_version bigint;
ALTER TABLE orders ADD CONSTRAINT performance_order_snapshot_complete CHECK (
    (performance_event_id IS NULL AND performance_title IS NULL AND performance_venue_name IS NULL
        AND performance_starts_at IS NULL AND performance_hold_version IS NULL) OR
    (performance_event_id IS NOT NULL AND performance_title IS NOT NULL AND performance_venue_name IS NOT NULL
        AND performance_starts_at IS NOT NULL AND performance_hold_version IS NOT NULL AND performance_hold_version > 0)
);

ALTER TABLE order_items ADD COLUMN group_id uuid;
ALTER TABLE order_items ADD COLUMN seat_id uuid;
ALTER TABLE order_items ADD COLUMN offer_name text;
ALTER TABLE order_items ADD COLUMN section_label text;
ALTER TABLE order_items ADD COLUMN row_label text;
ALTER TABLE order_items ADD COLUMN seat_label text;
ALTER TABLE order_items ADD CONSTRAINT performance_order_line_snapshot_complete CHECK (
    (group_id IS NULL AND seat_id IS NULL AND offer_name IS NULL AND section_label IS NULL
        AND row_label IS NULL AND seat_label IS NULL) OR
    (group_id IS NOT NULL AND offer_name IS NOT NULL AND section_label IS NOT NULL
        AND ((seat_id IS NULL AND row_label IS NULL AND seat_label IS NULL) OR
             (seat_id IS NOT NULL AND quantity = 1 AND row_label IS NOT NULL AND seat_label IS NOT NULL)))
);
ALTER TABLE order_items DROP CONSTRAINT uq_order_items_order_ticket_type;
CREATE UNIQUE INDEX uq_order_items_order_ticket_type ON order_items(order_id,ticket_type_id)
    WHERE group_id IS NULL;
CREATE UNIQUE INDEX performance_order_items_unique_seat ON order_items(order_id,seat_id)
    WHERE seat_id IS NOT NULL;

ALTER TABLE performance_seats ADD COLUMN hold_id uuid;
ALTER TABLE performance_seats ADD COLUMN order_item_id uuid REFERENCES order_items(id);
ALTER TABLE performance_seats ADD FOREIGN KEY (performance_id, hold_id)
    REFERENCES performance_holds(performance_id, id);
ALTER TABLE performance_seats ADD CONSTRAINT performance_seat_stock_owner CHECK (
    (status = 'HELD' AND hold_id IS NOT NULL AND order_item_id IS NULL) OR
    (status = 'ALLOCATED' AND hold_id IS NULL AND order_item_id IS NOT NULL) OR
    (status IN ('AVAILABLE','BLOCKED') AND hold_id IS NULL AND order_item_id IS NULL)
);
CREATE UNIQUE INDEX performance_seat_order_item ON performance_seats(order_item_id)
    WHERE order_item_id IS NOT NULL;

CREATE TABLE performance_hold_requests (
    performance_id uuid NOT NULL REFERENCES performance_sales(id),
    user_id uuid NOT NULL,
    request_key text NOT NULL,
    payload_hash text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (performance_id,user_id,request_key)
);

-- Old streams predate these columns. Preserve their original snapshot shape.
CREATE OR REPLACE FUNCTION order_projection_snapshot(target_order UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN o.performance_event_id IS NULL
        THEN to_jsonb(o) - ARRAY['performance_event_id','performance_title','performance_venue_name',
                'performance_starts_at','performance_hold_version']
        ELSE to_jsonb(o) END
        || jsonb_build_object('items', COALESCE((
            SELECT jsonb_agg(
                CASE WHEN i.group_id IS NULL
                    THEN to_jsonb(i) - ARRAY['group_id','seat_id','offer_name','section_label','row_label','seat_label']
                    ELSE to_jsonb(i) END
                ORDER BY i.id)
            FROM order_items i WHERE i.order_id = o.id
        ), '[]'::jsonb))
    FROM orders o WHERE o.id = target_order
$$;
