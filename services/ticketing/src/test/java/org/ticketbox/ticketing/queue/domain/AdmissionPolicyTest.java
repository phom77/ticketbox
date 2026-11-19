package org.ticketbox.ticketing.queue.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AdmissionPolicyTest {
    @Test
    void sizesAnOpeningWaveAndKeepsItsPeakUntilTheQueueDrains() {
        var state = AdmissionPolicy.initial(75_000);
        assertEquals(42, AdmissionPolicy.target(state.peak()));
        assertEquals(20, state.rate());
        assertEquals(2880, AdmissionPolicy.capacity(state.rate()));
        assertEquals(6048, AdmissionPolicy.capacity(42));
        assertEquals(5, AdmissionPolicy.target(10));
        assertEquals(60, AdmissionPolicy.target(Long.MAX_VALUE));
        assertEquals(8640, AdmissionPolicy.capacity(60));
        assertEquals(10_000, AdmissionPolicy.capacity(100));
        assertEquals(75_000, state.withWaiting(100).peak());
        assertEquals(0, state.withWaiting(0).peak());
        assertEquals(66, AdmissionPolicy.sharedLimit(250, 170));
    }

    @Test
    void rampsAfterTwoHealthyWindowsAndSlowsImmediatelyOnOverload() {
        var state = AdmissionPolicy.initial(75_000);
        var healthy = new AdmissionPolicy.Sample(20, 1, 0, false);
        var sparse = new AdmissionPolicy.Sample(19, 0, 0, false);
        assertEquals(AdmissionPolicy.Health.HEALTHY, AdmissionPolicy.health(healthy, AdmissionPolicy.Sample.EMPTY));
        assertEquals(AdmissionPolicy.Health.SPARSE, AdmissionPolicy.health(sparse, AdmissionPolicy.Sample.EMPTY));
        assertEquals(AdmissionPolicy.Health.OVERLOADED, AdmissionPolicy.health(new AdmissionPolicy.Sample(20, 2, 0, false), healthy));
        assertEquals(AdmissionPolicy.Health.OVERLOADED, AdmissionPolicy.health(new AdmissionPolicy.Sample(100, 0, 1, false), healthy));
        assertEquals(AdmissionPolicy.Health.OVERLOADED, AdmissionPolicy.health(new AdmissionPolicy.Sample(0, 0, 0, true), healthy));

        state = state.advance(AdmissionPolicy.Health.HEALTHY, 42);
        assertEquals(20, state.rate());
        state = state.advance(AdmissionPolicy.Health.SPARSE, 42)
                .advance(AdmissionPolicy.Health.HEALTHY, 42);
        assertEquals(20, state.rate());
        state = state.advance(AdmissionPolicy.Health.HEALTHY, 42);
        assertEquals(25, state.rate());
        assertEquals(12, state.advance(AdmissionPolicy.Health.OVERLOADED, 42).rate());
        assertEquals(1, new AdmissionPolicy.State(75_000, 1, 0)
                .advance(AdmissionPolicy.Health.OVERLOADED, 42).rate());
    }
}
