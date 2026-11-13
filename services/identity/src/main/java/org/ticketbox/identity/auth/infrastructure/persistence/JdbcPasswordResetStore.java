package org.ticketbox.identity.auth.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.identity.auth.application.port.PasswordResetStore;

import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcPasswordResetStore implements PasswordResetStore {
    private final JdbcTemplate db;

    JdbcPasswordResetStore(JdbcTemplate db) {
        this.db = db;
    }

    public boolean allow(String kind, byte[] digest, long bucket, int limit) {
        return db.update("""
                INSERT INTO password_reset_budgets(kind,key_digest,bucket,requests) VALUES (?,?,?,1)
                ON CONFLICT (kind,key_digest,bucket) DO UPDATE SET requests=password_reset_budgets.requests+1
                WHERE password_reset_budgets.requests < ?
                """, kind, digest, bucket, limit) == 1;
    }

    public void issue(UUID accountId, UUID id, long version, byte[] digest, byte[] encryptedToken) {
        db.update("""
                INSERT INTO password_resets(account_id,id,session_version,token_digest,encrypted_token,expires_at)
                VALUES (?,?,?,?,?,clock_timestamp() + interval '30 minutes')
                ON CONFLICT (account_id) DO UPDATE SET id=excluded.id, session_version=excluded.session_version,
                    token_digest=excluded.token_digest, encrypted_token=excluded.encrypted_token,
                    expires_at=excluded.expires_at, next_attempt_at=clock_timestamp(), lease_id=NULL
                """, accountId, id, version, digest, encryptedToken);
    }

    public Optional<UUID> findAccount(byte[] digest) {
        return db.query("SELECT account_id FROM password_resets WHERE token_digest=? AND expires_at>clock_timestamp()",
                (row, index) -> row.getObject("account_id", UUID.class), digest).stream().findFirst();
    }

    public boolean consume(UUID accountId, long version, byte[] digest) {
        return db.update("""
                DELETE FROM password_resets WHERE account_id=? AND session_version=? AND token_digest=?
                    AND expires_at>clock_timestamp()
                """, accountId, version, digest) == 1;
    }

    public Optional<Delivery> claim(UUID leaseId, long currentBucket) {
        db.update("DELETE FROM password_reset_budgets WHERE bucket < ?", currentBucket - 1);
        db.update("DELETE FROM password_resets WHERE expires_at <= clock_timestamp()");
        return db.query("""
                WITH candidate AS (
                    SELECT r.id,u.email FROM password_resets r JOIN users u ON u.id=r.account_id
                    WHERE r.encrypted_token IS NOT NULL AND r.expires_at>clock_timestamp()
                      AND r.next_attempt_at<=clock_timestamp() AND u.is_active AND u.role='AUDIENCE'
                      AND u.session_version=r.session_version
                    ORDER BY r.next_attempt_at,r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED
                ) UPDATE password_resets r SET lease_id=?, next_attempt_at=clock_timestamp()+interval '45 seconds'
                FROM candidate c WHERE r.id=c.id RETURNING r.id,r.lease_id,c.email,r.encrypted_token
                """, (row, index) -> new Delivery(row.getObject("id", UUID.class),
                row.getObject("lease_id", UUID.class), row.getString("email"), row.getBytes("encrypted_token")),
                leaseId).stream().findFirst();
    }

    public void finish(UUID id, UUID leaseId, boolean delivered) {
        db.update("""
                UPDATE password_resets SET encrypted_token=CASE WHEN ? THEN NULL ELSE encrypted_token END,
                    lease_id=NULL, next_attempt_at=clock_timestamp()+interval '30 seconds'
                WHERE id=? AND lease_id=?
                """, delivered, id, leaseId);
    }
}
