-- Optional buyer-facing ticket type details published by Catalog (additive; absent means none / minimum 1).
ALTER TABLE performance_offers
    ADD COLUMN description text CHECK (description IS NULL OR length(description) BETWEEN 1 AND 500),
    ADD COLUMN min_per_order integer NOT NULL DEFAULT 1 CHECK (min_per_order BETWEEN 1 AND 100);
