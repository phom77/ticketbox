-- Optional buyer-facing ticket type details (additive; existing rows get no description and minimum 1).
ALTER TABLE performance_sale_offers
    ADD COLUMN description text CHECK (description IS NULL OR length(description) BETWEEN 1 AND 500),
    ADD COLUMN min_per_order integer NOT NULL DEFAULT 1 CHECK (min_per_order BETWEEN 1 AND 100);
