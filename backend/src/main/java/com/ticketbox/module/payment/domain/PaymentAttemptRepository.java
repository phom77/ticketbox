package com.ticketbox.module.payment.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

public interface PaymentAttemptRepository extends JpaRepository<PaymentAttempt, UUID> {
    @Query(value = "select state,count(*),coalesce(extract(epoch from (now()-min(created_at))),0) from payment_attempts group by state", nativeQuery = true)
    List<Object[]> stateMetrics();
    Optional<PaymentAttempt> findByOrderId(UUID orderId);
    @Query(value = """
        select * from payment_attempts where state in ('PROCESSING','UNKNOWN','READY')
        and next_query_at <= now() and (lease_until is null or lease_until < now())
        order by next_query_at limit :batch for update skip locked
        """, nativeQuery = true)
    List<PaymentAttempt> claimable(@Param("batch") int batch);
}
