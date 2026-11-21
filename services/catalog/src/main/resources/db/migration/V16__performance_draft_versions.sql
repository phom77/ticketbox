ALTER TABLE events ADD COLUMN draft_version BIGINT NOT NULL DEFAULT 0 CHECK (draft_version >= 0);
ALTER TABLE performances ADD COLUMN draft_version BIGINT NOT NULL DEFAULT 0 CHECK (draft_version >= 0);

CREATE OR REPLACE VIEW catalog_event_view AS
SELECT e.id, CASE WHEN c.id IS NULL THEN e.organization_id ELSE c.organization_id END AS organization_id,
       CASE WHEN c.id IS NULL THEN e.title ELSE c.title END AS title,
       CASE WHEN c.id IS NULL THEN e.description ELSE c.description END AS description,
       e.category, e.legacy_concert_id, e.created_at, e.draft_version
FROM events e LEFT JOIN concerts c ON c.id = e.legacy_concert_id;

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
       ELSE c.is_public AND c.status <> 'DRAFT'
          AND (old.activation_version IS NULL OR old.ticketing_version >= old.activation_version)
       END AS discoverable, p.draft_version
FROM performances p
LEFT JOIN concerts c ON c.id = p.legacy_concert_id
LEFT JOIN sale_config_outbox old ON old.concert_id = c.id
LEFT JOIN venue_spaces s ON s.id = p.venue_space_id
LEFT JOIN venues v ON v.id = s.venue_id
LEFT JOIN performance_sale_publications pub ON pub.performance_id = p.id AND pub.version = p.sale_version;
