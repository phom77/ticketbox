CREATE TABLE events (
    id UUID PRIMARY KEY,
    organization_id UUID,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 500),
    description TEXT,
    category TEXT,
    legacy_concert_id UUID UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (legacy_concert_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX events_org_created_idx ON events(organization_id, created_at DESC, id);

CREATE TABLE venues (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 500),
    address TEXT NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 1000)
);
CREATE INDEX venues_org_name_idx ON venues(organization_id, name, id);

CREATE TABLE venue_spaces (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venues(id),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    UNIQUE (venue_id, name)
);

CREATE TABLE performances (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_space_id UUID REFERENCES venue_spaces(id),
    legacy_concert_id UUID UNIQUE REFERENCES concerts(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    doors_open_at TIMESTAMPTZ,
    timezone TEXT NOT NULL,
    sale_start_at TIMESTAMPTZ,
    sale_end_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'ON_SALE', 'SOLD_OUT', 'CANCELLED', 'COMPLETED')),
    max_per_account INTEGER NOT NULL DEFAULT 4 CHECK (max_per_account BETWEEN 1 AND 100),
    public_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sales_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    resumed_admission_at TIMESTAMPTZ,
    sale_version BIGINT NOT NULL DEFAULT 0 CHECK (sale_version >= 0),
    layout_version BIGINT CHECK (layout_version > 0),
    CHECK (legacy_concert_id IS NOT NULL OR (
        venue_space_id IS NOT NULL AND starts_at IS NOT NULL AND ends_at > starts_at
        AND ends_at IS NOT NULL AND (doors_open_at IS NULL OR doors_open_at <= starts_at)
        AND sale_start_at IS NOT NULL AND sale_end_at IS NOT NULL
        AND sale_start_at < sale_end_at AND sale_end_at <= starts_at))
);
CREATE INDEX performances_event_starts_idx ON performances(event_id, starts_at, id);

CREATE FUNCTION link_legacy_concert_to_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO events(id, organization_id, title, description, legacy_concert_id, created_at)
    VALUES (NEW.id, NEW.organization_id, NEW.title, NEW.description, NEW.id, NEW.created_at)
    ON CONFLICT (legacy_concert_id) DO NOTHING;

    INSERT INTO performances(id, event_id, legacy_concert_id, timezone)
    VALUES (NEW.id, NEW.id, NEW.id, 'Asia/Ho_Chi_Minh')
    ON CONFLICT (legacy_concert_id) DO NOTHING;
    RETURN NEW;
END $$;

CREATE TRIGGER concert_event_link AFTER INSERT ON concerts
    FOR EACH ROW EXECUTE FUNCTION link_legacy_concert_to_event();

INSERT INTO events(id, organization_id, title, description, legacy_concert_id, created_at)
SELECT id, organization_id, title, description, id, created_at FROM concerts
ON CONFLICT (legacy_concert_id) DO NOTHING;

INSERT INTO performances(id, event_id, legacy_concert_id, timezone)
SELECT id, id, id, 'Asia/Ho_Chi_Minh' FROM concerts
ON CONFLICT (legacy_concert_id) DO NOTHING;

CREATE TABLE performance_sale_publications (
    performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    version BIGINT NOT NULL CHECK (version > 0),
    payload JSONB NOT NULL,
    actor_id UUID NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ticketing_ack BOOLEAN NOT NULL DEFAULT FALSE,
    checkin_ack BOOLEAN NOT NULL DEFAULT FALSE,
    ticketing_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checkin_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(performance_id, version)
);
CREATE INDEX performance_sale_ticketing_pending_idx
    ON performance_sale_publications(performance_id, version) WHERE NOT ticketing_ack;
CREATE INDEX performance_sale_checkin_pending_idx
    ON performance_sale_publications(performance_id, version) WHERE NOT checkin_ack;

CREATE VIEW catalog_event_view AS
SELECT e.id, CASE WHEN c.id IS NULL THEN e.organization_id ELSE c.organization_id END AS organization_id,
       CASE WHEN c.id IS NULL THEN e.title ELSE c.title END AS title,
       CASE WHEN c.id IS NULL THEN e.description ELSE c.description END AS description,
       e.category, e.legacy_concert_id, e.created_at
FROM events e LEFT JOIN concerts c ON c.id = e.legacy_concert_id;

CREATE VIEW catalog_performance_view AS
SELECT p.id, p.event_id, p.venue_space_id, p.legacy_concert_id,
       COALESCE(c.venue_name, v.name) AS venue_name, COALESCE(c.venue_address, v.address) AS venue_address,
       s.name AS space_name, COALESCE(c.event_date,p.starts_at) AS starts_at,
       p.ends_at, COALESCE(c.doors_open_at,p.doors_open_at) AS doors_open_at, p.timezone,
       COALESCE(c.sale_start_at,p.sale_start_at) AS sale_start_at,
       COALESCE(c.sale_end_at,p.sale_end_at) AS sale_end_at, COALESCE(c.status,p.status) AS status,
       p.max_per_account, COALESCE(c.is_public,p.public_visible) AS public_visible,
       COALESCE(c.sales_suspended,p.sales_suspended) AS sales_suspended,
       COALESCE(c.resumed_admission_at,p.resumed_admission_at) AS resumed_admission_at,
       p.sale_version, p.layout_version,
       CASE WHEN c.id IS NULL THEN p.public_visible AND p.status <> 'DRAFT' AND COALESCE(pub.ticketing_ack,false)
       ELSE c.is_public AND c.status <> 'DRAFT'
          AND (old.activation_version IS NULL OR old.ticketing_version >= old.activation_version)
       END AS discoverable
FROM performances p
LEFT JOIN concerts c ON c.id = p.legacy_concert_id
LEFT JOIN sale_config_outbox old ON old.concert_id = c.id
LEFT JOIN venue_spaces s ON s.id = p.venue_space_id
LEFT JOIN venues v ON v.id = s.venue_id
LEFT JOIN performance_sale_publications pub ON pub.performance_id = p.id AND pub.version = p.sale_version;
