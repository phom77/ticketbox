CREATE TABLE layout_backgrounds (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    source_performance_id UUID NOT NULL REFERENCES performances(id),
    content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
    content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880)
);

CREATE TABLE performance_layout_drafts (
    performance_id UUID PRIMARY KEY REFERENCES performances(id) ON DELETE CASCADE,
    version BIGINT NOT NULL CHECK (version > 0),
    document JSONB NOT NULL
);

CREATE TABLE layout_templates (
    id UUID PRIMARY KEY,
    organization_id UUID,
    venue_space_id UUID NOT NULL REFERENCES venue_spaces(id),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    version BIGINT NOT NULL CHECK (version > 0)
);
CREATE INDEX layout_templates_space_org_idx ON layout_templates(venue_space_id, organization_id, id);

CREATE TABLE layout_revisions (
    template_id UUID NOT NULL REFERENCES layout_templates(id) ON DELETE CASCADE,
    version BIGINT NOT NULL CHECK (version > 0),
    document JSONB NOT NULL,
    PRIMARY KEY (template_id, version)
);

CREATE TABLE performance_layouts (
    performance_id UUID NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
    version BIGINT NOT NULL CHECK (version > 0),
    width DOUBLE PRECISION NOT NULL CHECK (width > 0 AND width <= 1000000),
    height DOUBLE PRECISION NOT NULL CHECK (height > 0 AND height <= 1000000),
    background_id UUID REFERENCES layout_backgrounds(id),
    shapes JSONB NOT NULL,
    checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (performance_id, version)
);

ALTER TABLE performances ADD CONSTRAINT published_layout_same_performance_fk
    FOREIGN KEY (id, layout_version) REFERENCES performance_layouts(performance_id, version);

CREATE TABLE layout_sections (
    performance_id UUID NOT NULL,
    version BIGINT NOT NULL,
    id UUID NOT NULL,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('GA','ASSIGNED')),
    points JSONB NOT NULL,
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    PRIMARY KEY (performance_id, version, id),
    UNIQUE (performance_id, version, code),
    FOREIGN KEY (performance_id, version) REFERENCES performance_layouts(performance_id, version) ON DELETE CASCADE
);

CREATE TABLE layout_rows (
    performance_id UUID NOT NULL,
    version BIGINT NOT NULL,
    section_id UUID NOT NULL,
    id UUID NOT NULL,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    PRIMARY KEY (performance_id, version, section_id, id),
    UNIQUE (performance_id, version, section_id, code),
    FOREIGN KEY (performance_id, version, section_id)
        REFERENCES layout_sections(performance_id, version, id) ON DELETE CASCADE
);

CREATE TABLE layout_seats (
    performance_id UUID NOT NULL,
    version BIGINT NOT NULL,
    section_id UUID NOT NULL,
    row_id UUID NOT NULL,
    id UUID NOT NULL,
    label TEXT NOT NULL,
    x DOUBLE PRECISION NOT NULL CHECK (x >= 0 AND x <= 1000000),
    y DOUBLE PRECISION NOT NULL CHECK (y >= 0 AND y <= 1000000),
    accessible BOOLEAN NOT NULL,
    restricted_view BOOLEAN NOT NULL,
    segment TEXT,
    position INTEGER CHECK (position >= 0),
    blocked BOOLEAN NOT NULL,
    sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
    CHECK ((segment IS NULL) = (position IS NULL)),
    PRIMARY KEY (performance_id, version, id),
    UNIQUE (performance_id, version, section_id, row_id, label),
    UNIQUE (performance_id, version, section_id, row_id, segment, position),
    FOREIGN KEY (performance_id, version, section_id, row_id)
        REFERENCES layout_rows(performance_id, version, section_id, id) ON DELETE CASCADE
);
