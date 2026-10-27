package com.ticketbox.module.payment.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PaymentLogRepository extends JpaRepository<PaymentLog, UUID> {
    boolean existsByOrderIdAndEventType(UUID orderId, PaymentLog.EventType eventType);
    List<PaymentLog> findByOrderId(UUID orderId);
}
