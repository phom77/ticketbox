CREATE TABLE projection_versions (
    kind TEXT NOT NULL CHECK(kind IN ('catalog','ticket')),
    id UUID NOT NULL,
    version BIGINT NOT NULL CHECK(version > 0),
    PRIMARY KEY(kind,id)
);
