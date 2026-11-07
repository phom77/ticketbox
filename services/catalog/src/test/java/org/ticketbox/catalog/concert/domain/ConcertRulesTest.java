package org.ticketbox.catalog.concert.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ConcertRulesTest {
    @Test
    void completedConcertCannotReopenButSoldOutSaleCan() {
        Concert concert = new Concert();
        concert.changeStatus(Concert.Status.ON_SALE);
        concert.changeStatus(Concert.Status.SOLD_OUT);
        concert.changeStatus(Concert.Status.ON_SALE);
        concert.changeStatus(Concert.Status.COMPLETED);
        assertThrows(
                IllegalStateException.class, () -> concert.changeStatus(Concert.Status.ON_SALE));
    }
}
