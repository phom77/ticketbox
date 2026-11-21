ALTER TABLE concerts ADD COLUMN sales_mode text NOT NULL DEFAULT 'V1'
    CHECK (sales_mode IN ('V1', 'V2'));

CREATE TABLE performance_sales (
    id uuid PRIMARY KEY REFERENCES concerts(id),
    event_id uuid NOT NULL,
    source_version bigint NOT NULL CHECK (source_version > 0),
    layout_version bigint CHECK (layout_version > 0),
    layout_checksum text,
    ends_at timestamptz NOT NULL,
    timezone text NOT NULL,
    max_per_account integer NOT NULL CHECK (max_per_account BETWEEN 1 AND 100),
    source_payload jsonb NOT NULL,
    CHECK ((layout_version IS NULL) = (layout_checksum IS NULL))
);

CREATE TABLE performance_groups (
    performance_id uuid NOT NULL REFERENCES performance_sales(id),
    id uuid NOT NULL,
    section_id uuid,
    section_label text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('GA', 'ASSIGNED')),
    capacity integer NOT NULL CHECK (capacity > 0),
    available integer NOT NULL CHECK (available >= 0),
    held integer NOT NULL DEFAULT 0 CHECK (held >= 0),
    allocated integer NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    PRIMARY KEY (performance_id, id),
    CHECK (kind = 'ASSIGNED' OR capacity = available + held + allocated),
    CHECK (kind = 'GA' OR (section_id IS NOT NULL AND available = 0 AND held = 0 AND allocated = 0))
);

CREATE INDEX performance_groups_by_section ON performance_groups(performance_id, section_id);
CREATE UNIQUE INDEX one_ga_group_per_section ON performance_groups(performance_id, section_id)
    NULLS NOT DISTINCT WHERE kind = 'GA';

CREATE TABLE performance_seats (
    performance_id uuid NOT NULL,
    id uuid NOT NULL,
    group_id uuid NOT NULL,
    row_label text NOT NULL,
    seat_label text NOT NULL,
    status text NOT NULL CHECK (status IN ('AVAILABLE', 'HELD', 'ALLOCATED', 'BLOCKED')),
    PRIMARY KEY (performance_id, id),
    FOREIGN KEY (performance_id, group_id) REFERENCES performance_groups(performance_id, id)
);

CREATE INDEX performance_seats_by_group ON performance_seats(performance_id, group_id, id);

ALTER TABLE ticket_types ADD COLUMN performance_offer boolean NOT NULL DEFAULT false;
ALTER TABLE ticket_types DROP CONSTRAINT uq_ticket_types_concert_name;
CREATE UNIQUE INDEX uq_ticket_types_concert_name ON ticket_types(concert_id, name)
    WHERE NOT performance_offer;

CREATE TABLE performance_offers (
    id uuid PRIMARY KEY REFERENCES ticket_types(id),
    performance_id uuid NOT NULL,
    group_id uuid NOT NULL,
    sale_start_at timestamptz NOT NULL,
    sale_end_at timestamptz NOT NULL,
    FOREIGN KEY (performance_id, group_id) REFERENCES performance_groups(performance_id, id),
    UNIQUE (performance_id, id),
    CHECK (sale_start_at < sale_end_at)
);
