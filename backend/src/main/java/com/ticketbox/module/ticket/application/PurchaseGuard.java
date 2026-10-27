package com.ticketbox.module.ticket.application;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** A transaction-scoped DB lock serializes reserve/release/convert even after a Redis lease expires. */
@Component @RequiredArgsConstructor
public class PurchaseGuard {
    private final JdbcTemplate jdbc;
    @Transactional(propagation = Propagation.MANDATORY)
    public void lock(UUID userId, UUID concertId) {
        jdbc.update("INSERT INTO purchase_guards(user_id,concert_id) VALUES (?,?) ON CONFLICT DO NOTHING",userId,concertId);
        jdbc.queryForObject("SELECT user_id FROM purchase_guards WHERE user_id=? AND concert_id=? FOR UPDATE",UUID.class,userId,concertId);
    }
}
