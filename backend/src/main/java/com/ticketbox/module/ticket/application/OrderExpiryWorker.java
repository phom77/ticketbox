package com.ticketbox.module.ticket.application;

import com.ticketbox.module.ticket.domain.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;

@Component @RequiredArgsConstructor @Slf4j
public class OrderExpiryWorker {
    private final OrderRepository orders;
    private final OrderService service;
    @Scheduled(fixedDelayString="${ticketbox.orders.expiration.fixed-delay-ms:60000}")
    public void expire() {
        for (var id : orders.expiredOrderIds()) {
            try { service.expireOrderIfDue(id); } catch (RuntimeException exception) { log.warn("Order expiry will retry",exception); }
        }
    }
}
