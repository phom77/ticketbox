ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_state_check;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_state_check
CHECK (state IN ('CREATED','PROCESSING','READY','UNKNOWN','FAILED','SUCCEEDED','RECONCILIATION_REQUIRED','REVIEW_REQUIRED'));
