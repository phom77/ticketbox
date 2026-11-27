-- Event classification: segment and genre reference data, per-event classification and the backfill from the
-- fixed categories of V20. events.category stays readable but is no longer written (dropped in a later release).
CREATE TABLE classification_segments (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    sort INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE classification_genres (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    segment_id TEXT NOT NULL REFERENCES classification_segments(id),
    sort INTEGER NOT NULL,
    popular BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (segment_id, id)
);

INSERT INTO classification_segments(id, sort) VALUES
    ('concerts', 1),
    ('festivals', 2),
    ('sports', 3),
    ('arts-theater-comedy', 4),
    ('family', 5),
    ('other', 6);

INSERT INTO classification_genres(id, segment_id, sort, popular) VALUES
    ('vpop', 'concerts', 1, TRUE),
    ('indie', 'concerts', 2, TRUE),
    ('rap-hip-hop', 'concerts', 3, TRUE),
    ('edm', 'concerts', 4, TRUE),
    ('rock', 'concerts', 5, TRUE),
    ('bolero', 'concerts', 6, TRUE),
    ('ballad', 'concerts', 7, FALSE),
    ('jazz', 'concerts', 8, FALSE),
    ('classical', 'concerts', 9, FALSE),
    ('kpop', 'concerts', 10, FALSE),
    ('international-pop', 'concerts', 11, FALSE),
    ('rnb-soul', 'concerts', 12, FALSE),
    ('acoustic', 'concerts', 13, FALSE),
    ('traditional-music', 'concerts', 14, FALSE),
    ('music-other', 'concerts', 15, FALSE),
    ('music-festival', 'festivals', 1, TRUE),
    ('cultural-festival', 'festivals', 2, TRUE),
    ('food-festival', 'festivals', 3, TRUE),
    ('film-festival', 'festivals', 4, FALSE),
    ('art-festival', 'festivals', 5, FALSE),
    ('festival-other', 'festivals', 6, FALSE),
    ('football', 'sports', 1, TRUE),
    ('esports', 'sports', 2, TRUE),
    ('running', 'sports', 3, TRUE),
    ('combat-sports', 'sports', 4, TRUE),
    ('basketball', 'sports', 5, FALSE),
    ('volleyball', 'sports', 6, FALSE),
    ('tennis-badminton', 'sports', 7, FALSE),
    ('motorsport', 'sports', 8, FALSE),
    ('sports-other', 'sports', 9, FALSE),
    ('theater', 'arts-theater-comedy', 1, TRUE),
    ('stand-up', 'arts-theater-comedy', 2, TRUE),
    ('musical', 'arts-theater-comedy', 3, TRUE),
    ('dance', 'arts-theater-comedy', 4, TRUE),
    ('cai-luong', 'arts-theater-comedy', 5, TRUE),
    ('cheo-tuong', 'arts-theater-comedy', 6, FALSE),
    ('water-puppetry', 'arts-theater-comedy', 7, FALSE),
    ('opera', 'arts-theater-comedy', 8, FALSE),
    ('comedy-show', 'arts-theater-comedy', 9, FALSE),
    ('exhibition', 'arts-theater-comedy', 10, FALSE),
    ('arts-other', 'arts-theater-comedy', 11, FALSE),
    ('kids-show', 'family', 1, TRUE),
    ('circus-magic', 'family', 2, TRUE),
    ('family-concert', 'family', 3, TRUE),
    ('workshop-kids', 'family', 4, FALSE),
    ('family-other', 'family', 5, FALSE),
    ('talk-conference', 'other', 1, TRUE),
    ('workshop', 'other', 2, TRUE),
    ('meetup', 'other', 3, FALSE),
    ('other', 'other', 4, FALSE);

ALTER TABLE events
    ADD COLUMN segment_id TEXT REFERENCES classification_segments(id),
    ADD COLUMN primary_genre_id TEXT,
    ADD CONSTRAINT events_primary_genre_in_segment FOREIGN KEY (segment_id, primary_genre_id)
        REFERENCES classification_genres(segment_id, id),
    ADD CONSTRAINT events_genre_needs_segment CHECK (primary_genre_id IS NULL OR segment_id IS NOT NULL);

CREATE INDEX events_segment_idx ON events(segment_id) WHERE segment_id IS NOT NULL;

CREATE TABLE event_genres (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    genre_id TEXT NOT NULL REFERENCES classification_genres(id),
    sort SMALLINT NOT NULL,
    PRIMARY KEY (event_id, genre_id)
);

CREATE INDEX event_genres_genre_idx ON event_genres(genre_id, event_id);

-- Backfill from the old category ids. arts-theater and comedy merge; comedy gets the stand-up genre.
UPDATE events SET segment_id = CASE category
    WHEN 'concerts' THEN 'concerts'
    WHEN 'festivals' THEN 'festivals'
    WHEN 'sports' THEN 'sports'
    WHEN 'arts-theater' THEN 'arts-theater-comedy'
    WHEN 'comedy' THEN 'arts-theater-comedy'
    WHEN 'family' THEN 'family'
END
WHERE category IS NOT NULL;

UPDATE events SET primary_genre_id = 'stand-up' WHERE category = 'comedy' AND segment_id = 'arts-theater-comedy';

-- Demo seed events get a primary genre by id.
UPDATE events e SET primary_genre_id = d.genre
FROM (VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 'vpop'), ('10000000-0000-0000-0000-000000000002', 'vpop'),
    ('10000000-0000-0000-0000-000000000003', 'vpop'), ('10000000-0000-0000-0000-000000000004', 'vpop'),
    ('10000000-0000-0000-0000-000000000005', 'indie'), ('10000000-0000-0000-0000-000000000006', 'music-festival'),
    ('10000000-0000-0000-0000-000000000007', 'music-festival'), ('10000000-0000-0000-0000-000000000008', 'acoustic'),
    ('10000000-0000-0000-0000-000000000009', 'arts-other'), ('10000000-0000-0000-0000-000000000010', 'music-festival'),
    ('10000000-0000-0000-0000-000000000011', 'music-festival'), ('10000000-0000-0000-0000-000000000012', 'music-festival'),
    ('10000000-0000-0000-0000-000000000013', 'music-other'), ('10000000-0000-0000-0000-000000000014', 'music-festival'),
    ('10000000-0000-0000-0000-000000000015', 'jazz'), ('10000000-0000-0000-0000-000000000016', 'vpop'),
    ('10000000-0000-0000-0000-000000000017', 'music-festival'), ('10000000-0000-0000-0000-000000000018', 'arts-other'),
    ('10000000-0000-0000-0000-000000000019', 'acoustic'), ('10000000-0000-0000-0000-000000000020', 'music-festival'),
    ('70000000-0000-0000-0000-000000000001', 'music-other')
) AS d(id, genre)
JOIN classification_genres g ON g.id = d.genre
WHERE e.id = d.id AND e.segment_id = g.segment_id AND e.primary_genre_id IS NULL;

DO $$
DECLARE mapping RECORD;
BEGIN
    FOR mapping IN
        SELECT coalesce(category, '(none)') AS category, coalesce(segment_id, '(none)') AS segment,
               coalesce(primary_genre_id, '(none)') AS genre, count(*) AS events
        FROM events GROUP BY 1, 2, 3 ORDER BY 1, 2, 3
    LOOP
        RAISE NOTICE 'event classification backfill: category % -> segment % genre %: % events',
            mapping.category, mapping.segment, mapping.genre, mapping.events;
    END LOOP;
END $$;
