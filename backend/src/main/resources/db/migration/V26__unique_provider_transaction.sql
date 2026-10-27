CREATE UNIQUE INDEX payment_attempt_transaction_idx ON payment_attempts(provider,provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;
