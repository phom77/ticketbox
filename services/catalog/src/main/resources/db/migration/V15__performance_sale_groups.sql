CREATE TABLE performance_sale_groups (
    performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    id UUID NOT NULL,
    section_id UUID,
    section_label TEXT NOT NULL CHECK (length(btrim(section_label)) BETWEEN 1 AND 500),
    kind TEXT NOT NULL CHECK (kind IN ('GA', 'ASSIGNED')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    CHECK (kind <> 'ASSIGNED' OR section_id IS NOT NULL),
    PRIMARY KEY (performance_id, id)
);

CREATE UNIQUE INDEX one_ga_pool_per_mapped_section
    ON performance_sale_groups(performance_id, section_id)
    WHERE kind = 'GA' AND section_id IS NOT NULL;

CREATE TABLE performance_sale_group_seats (
    performance_id UUID NOT NULL,
    group_id UUID NOT NULL,
    id UUID NOT NULL,
    row_label TEXT NOT NULL CHECK (length(btrim(row_label)) BETWEEN 1 AND 80),
    seat_label TEXT NOT NULL CHECK (length(btrim(seat_label)) BETWEEN 1 AND 80),
    blocked BOOLEAN NOT NULL,
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    PRIMARY KEY (performance_id, id),
    FOREIGN KEY (performance_id, group_id)
        REFERENCES performance_sale_groups(performance_id, id) ON DELETE CASCADE
);
CREATE INDEX performance_group_seats_sort_idx
    ON performance_sale_group_seats(performance_id, group_id, sort_index);

CREATE TABLE performance_sale_offers (
    performance_id UUID NOT NULL,
    id UUID NOT NULL,
    group_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    price NUMERIC(12, 0) NOT NULL CHECK (price > 0),
    currency TEXT NOT NULL CHECK (currency = 'VND'),
    sale_start_at TIMESTAMPTZ NOT NULL,
    sale_end_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL,
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    CHECK (sale_start_at < sale_end_at),
    PRIMARY KEY (performance_id, id),
    FOREIGN KEY (performance_id, group_id)
        REFERENCES performance_sale_groups(performance_id, id) ON DELETE CASCADE
);
CREATE INDEX performance_sale_offers_group_idx ON performance_sale_offers(performance_id, group_id);
