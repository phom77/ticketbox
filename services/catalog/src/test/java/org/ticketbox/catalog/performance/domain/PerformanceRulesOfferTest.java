package org.ticketbox.catalog.performance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.domain.PerformanceSale.Group;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;
import org.ticketbox.catalog.performance.domain.PerformanceSale.Offer;
import org.ticketbox.catalog.performance.domain.PerformanceSale.Seat;

class PerformanceRulesOfferTest {
    private static final OffsetDateTime START = OffsetDateTime.parse("2027-03-01T12:00:00Z");
    private static final OffsetDateTime END = START.plusHours(3);

    private static Group floor(int capacity) {
        return new Group(UUID.randomUUID(), null, "Floor", Kind.GA, capacity, List.of());
    }

    private static Group stand(int seats) {
        var list = java.util.stream.IntStream.rangeClosed(1, seats)
                .mapToObj(n -> new Seat(UUID.randomUUID(), "A", String.valueOf(n), false)).toList();
        return new Group(UUID.randomUUID(), null, "Stand", Kind.ASSIGNED, seats, list);
    }

    private static Offer offer(Group group, String description, Integer minimum) {
        return new Offer(UUID.randomUUID(), group.id(), "Standard", BigDecimal.valueOf(100_000), "VND",
                START, END, true, description, minimum);
    }

    private static void validate(Group group, Offer offer, int limit) {
        PerformanceRules.validateSale(new PerformanceSale(List.of(group), List.of(offer)), START, END, null, false,
                limit);
    }

    private static void assertRule(Group group, Offer offer, int limit, String key) {
        assertThatThrownBy(() -> validate(group, offer, limit)).isInstanceOfSatisfying(DomainViolation.class,
                error -> assertThat(error.getMessage()).isEqualTo(key));
    }

    @Test
    void acceptsAMinimumWithinEveryBound() {
        var group = floor(10);
        validate(group, offer(group, null, 4), 4);
        validate(group, offer(group, "x".repeat(500), 1), 4);
    }

    @Test
    void refusesAMinimumAboveOneHundred() {
        var group = floor(500);
        assertRule(group, offer(group, null, 101), 100, "error.performance.invalid-offer-min");
        assertRule(group, offer(group, null, 0), 100, "error.performance.invalid-offer-min");
    }

    @Test
    void refusesAMinimumAboveThePerAccountLimit() {
        var group = floor(50);
        assertRule(group, offer(group, null, 5), 4, "error.performance.offer-min-above-limit");
    }

    @Test
    void refusesAMinimumAboveTheGeneralAdmissionCapacity() {
        var group = floor(3);
        assertRule(group, offer(group, null, 4), 10, "error.performance.offer-min-above-capacity");
    }

    @Test
    void refusesAMinimumAboveTheSeatCountOfASeatedPool() {
        var group = stand(3);
        assertRule(group, offer(group, null, 4), 10, "error.performance.offer-min-above-capacity");
        validate(group, offer(group, null, 3), 10);
    }

    @Test
    void refusesADescriptionOfMoreThanFiveHundredCharacters() {
        var group = floor(10);
        assertRule(group, offer(group, "x".repeat(501), 1), 4, "error.performance.invalid-offer-description");
    }

    @Test
    void storesABlankDescriptionAsNoneAndAMissingMinimumAsOne() {
        var group = floor(10);
        assertThat(offer(group, "   ", null).description()).isNull();
        assertThat(offer(group, "  perks ", null).description()).isEqualTo("perks");
        assertThat(offer(group, null, null).minPerOrder()).isEqualTo(1);
    }
}
