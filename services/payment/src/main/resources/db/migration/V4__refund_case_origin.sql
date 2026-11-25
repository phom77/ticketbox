-- Where a refund case came from. Null means a platform operator opened it, as before.
ALTER TABLE refund_reviews ADD COLUMN origin VARCHAR(12) CHECK (origin IS NULL OR origin IN ('BUYER', 'POSTPONEMENT'));
ALTER TABLE refund_reviews ADD COLUMN refund_request_id UUID;
ALTER TABLE refund_reviews ADD CONSTRAINT refund_reviews_origin_request CHECK ((origin IS NULL) = (refund_request_id IS NULL));
CREATE UNIQUE INDEX refund_reviews_request_idx ON refund_reviews (refund_request_id) WHERE refund_request_id IS NOT NULL;
