-- Event categories become a fixed list: concerts, festivals, sports, arts-theater, comedy, family.
-- Normalise what organizers typed, clear what matches nothing, then categorise the demo seed events.
CREATE TEMPORARY TABLE event_category_synonyms(alias TEXT PRIMARY KEY, id TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO event_category_synonyms(alias, id) VALUES
    ('concerts', 'concerts'), ('concert', 'concerts'), ('music', 'concerts'), ('live music', 'concerts'),
    ('gig', 'concerts'), ('gigs', 'concerts'), ('live', 'concerts'),
    ('festivals', 'festivals'), ('festival', 'festivals'), ('music festival', 'festivals'),
    ('sports', 'sports'), ('sport', 'sports'),
    ('arts-theater', 'arts-theater'), ('arts theater', 'arts-theater'), ('arts & theater', 'arts-theater'),
    ('arts and theater', 'arts-theater'), ('arts & theatre', 'arts-theater'), ('arts and theatre', 'arts-theater'),
    ('arts', 'arts-theater'), ('art', 'arts-theater'), ('theater', 'arts-theater'), ('theatre', 'arts-theater'),
    ('classical', 'arts-theater'), ('opera', 'arts-theater'),
    ('comedy', 'comedy'), ('stand-up', 'comedy'), ('standup', 'comedy'), ('stand up', 'comedy'),
    ('family', 'family'), ('families', 'family'), ('kids', 'family'), ('children', 'family');

DO $$
DECLARE cleared INTEGER;
BEGIN
    SELECT count(*) INTO cleared FROM events e
    WHERE e.category IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM event_category_synonyms s
        WHERE s.alias = regexp_replace(lower(btrim(replace(e.category, '_', ' '))), '\s+', ' ', 'g'));
    RAISE NOTICE 'event categories cleared because they matched no fixed id: %', cleared;
END $$;

UPDATE events e SET category = (
    SELECT s.id FROM event_category_synonyms s
    WHERE s.alias = regexp_replace(lower(btrim(replace(e.category, '_', ' '))), '\s+', ' ', 'g'))
WHERE e.category IS NOT NULL;

UPDATE events SET category = CASE id
    WHEN '10000000-0000-0000-0000-000000000006' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000007' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000009' THEN 'arts-theater'
    WHEN '10000000-0000-0000-0000-000000000010' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000011' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000012' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000014' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000017' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000020' THEN 'festivals'
    WHEN '10000000-0000-0000-0000-000000000018' THEN 'arts-theater'
    ELSE 'concerts'
END
WHERE category IS NULL AND legacy_concert_id IS NOT NULL AND (
    id IN ('70000000-0000-0000-0000-000000000001')
    OR id BETWEEN '10000000-0000-0000-0000-000000000001' AND '10000000-0000-0000-0000-000000000020');
