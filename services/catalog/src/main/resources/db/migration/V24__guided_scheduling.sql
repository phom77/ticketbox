-- Guided scheduling: venue library, release on approval, organizer sales pause, cancel and postpone requests.

-- Venue library. Coordinates stay nullable: no provider geocodes addresses and organizers do not type coordinates.
ALTER TABLE venues
    ADD COLUMN city TEXT CHECK (city IS NULL OR length(btrim(city)) BETWEEN 1 AND 120),
    ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (length(btrim(timezone)) BETWEEN 1 AND 64),
    ADD COLUMN capacity_hint INTEGER CHECK (capacity_hint IS NULL OR capacity_hint > 0),
    ADD COLUMN latitude NUMERIC(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude NUMERIC(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    ADD CONSTRAINT venues_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL));

-- Backfill the city with the discovery rule: last comma-separated part of the address, without a trailing country.
UPDATE venues
SET city = NULLIF(left(btrim(substring(regexp_replace(address, '\s*,\s*vi.t\s*nam\s*$', '', 'i') FROM '([^,]+)$')), 120), '')
WHERE position(',' IN address) > 0;

-- A copied performance can start without a sale start when the shifted one is already past; only drafts may be so.
DO $$
DECLARE constraint_name text;
BEGIN
    SELECT conname INTO constraint_name FROM pg_constraint
    WHERE conrelid = 'performances'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%venue_space_id IS NOT NULL%';
    IF constraint_name IS NULL THEN
        RAISE EXCEPTION 'performances native schedule CHECK constraint not found';
    END IF;
    EXECUTE format('ALTER TABLE performances DROP CONSTRAINT %I', constraint_name);
END $$;

ALTER TABLE performances ADD CONSTRAINT performances_native_schedule_check CHECK (legacy_concert_id IS NOT NULL OR (
    venue_space_id IS NOT NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
    AND (doors_open_at IS NULL OR doors_open_at <= starts_at)
    AND sale_end_at IS NOT NULL AND sale_end_at <= starts_at
    AND ((sale_start_at IS NOT NULL AND sale_start_at < sale_end_at) OR (sale_start_at IS NULL AND status = 'DRAFT'))));

CREATE OR REPLACE VIEW catalog_performance_view AS
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
       ELSE c.is_public AND c.status IN ('ON_SALE','SOLD_OUT') AND NOT c.sales_suspended
          AND (old.activation_version IS NULL OR old.ticketing_version >= old.activation_version)
       END AS discoverable, p.draft_version, v.city AS venue_city
FROM performances p
LEFT JOIN concerts c ON c.id = p.legacy_concert_id
LEFT JOIN sale_config_outbox old ON old.concert_id = c.id
LEFT JOIN venue_spaces s ON s.id = p.venue_space_id
LEFT JOIN venues v ON v.id = s.venue_id
LEFT JOIN performance_sale_publications pub ON pub.performance_id = p.id AND pub.version = p.sale_version;

-- Release as soon as approved: the release time is recorded when the review is approved.
ALTER TABLE performance_publication_reviews
    ADD COLUMN release_on_approval BOOLEAN NOT NULL DEFAULT FALSE,
    ALTER COLUMN publish_at DROP NOT NULL,
    ADD CONSTRAINT performance_review_release_time CHECK (release_on_approval OR publish_at IS NOT NULL);

-- Organizer pause of sales. Both versions are ordinary sale publications with sales_suspended set and cleared.
CREATE TABLE performance_sales_pauses (
    id UUID PRIMARY KEY,
    performance_id UUID NOT NULL REFERENCES performances(id),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
    paused_by UUID NOT NULL,
    pause_version BIGINT NOT NULL,
    resume_version BIGINT,
    resumed_by UUID,
    closed_reason VARCHAR(16) CHECK (closed_reason IN ('RESUMED', 'SUPERSEDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    closed_at TIMESTAMPTZ,
    FOREIGN KEY (performance_id, pause_version) REFERENCES performance_sale_publications(performance_id, version),
    FOREIGN KEY (performance_id, resume_version) REFERENCES performance_sale_publications(performance_id, version),
    CHECK ((closed_reason IS NULL) = (closed_at IS NULL)),
    CHECK ((closed_reason = 'RESUMED') = (resume_version IS NOT NULL)),
    CHECK ((resume_version IS NOT NULL) = (resumed_by IS NOT NULL))
);
CREATE UNIQUE INDEX performance_sales_pause_open_idx ON performance_sales_pauses(performance_id)
    WHERE closed_reason IS NULL;
CREATE INDEX performance_sales_pause_latest_idx ON performance_sales_pauses(performance_id, created_at DESC, id);

-- Cancel and postpone requests handed to platform operations. Accepting one is confirming the disruption.
CREATE TABLE performance_disruption_requests (
    id UUID PRIMARY KEY,
    performance_id UUID NOT NULL REFERENCES performances(id),
    organization_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('CANCEL', 'POSTPONE')),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    proposed_starts_at TIMESTAMPTZ,
    proposed_ends_at TIMESTAMPTZ,
    proposed_doors_open_at TIMESTAMPTZ,
    state VARCHAR(16) NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
    requested_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    decided_by UUID,
    decided_at TIMESTAMPTZ,
    decision_reason TEXT CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 1 AND 1000),
    disruption_id UUID REFERENCES performance_disruptions(id),
    CHECK (kind = 'CANCEL' OR (proposed_starts_at IS NOT NULL AND proposed_ends_at > proposed_starts_at)),
    CHECK ((state = 'ACCEPTED') = (disruption_id IS NOT NULL)),
    CHECK ((state = 'REQUESTED') = (decided_by IS NULL))
);
CREATE UNIQUE INDEX performance_disruption_request_open_idx ON performance_disruption_requests(performance_id)
    WHERE state = 'REQUESTED';
CREATE INDEX performance_disruption_request_queue_idx ON performance_disruption_requests(state, requested_at, id);
CREATE INDEX performance_disruption_request_org_idx ON performance_disruption_requests(performance_id, requested_at DESC);
