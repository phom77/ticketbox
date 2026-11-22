CREATE TABLE performance_publication_reviews (
    id uuid PRIMARY KEY,
    performance_id uuid NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    submitted_by uuid NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    publish_at timestamptz NOT NULL,
    sale_version bigint NOT NULL,
    layout_version bigint NOT NULL,
    event_draft_version bigint NOT NULL,
    schedule_draft_version bigint NOT NULL,
    summary jsonb NOT NULL,
    state varchar(24) NOT NULL CHECK (state IN (
        'SUBMITTED','SCHEDULED','CHANGES_REQUESTED','REJECTED','HELD','SUPERSEDED','RELEASED','MISSED'
    )),
    reviewer_id uuid,
    decided_at timestamptz,
    reason varchar(1000)
);
CREATE INDEX performance_review_latest ON performance_publication_reviews(performance_id,submitted_at DESC,id);
CREATE INDEX performance_review_due ON performance_publication_reviews(publish_at) WHERE state='SCHEDULED';

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
       END AS discoverable, p.draft_version
FROM performances p
LEFT JOIN concerts c ON c.id = p.legacy_concert_id
LEFT JOIN sale_config_outbox old ON old.concert_id = c.id
LEFT JOIN venue_spaces s ON s.id = p.venue_space_id
LEFT JOIN venues v ON v.id = s.venue_id
LEFT JOIN performance_sale_publications pub ON pub.performance_id = p.id AND pub.version = p.sale_version;
