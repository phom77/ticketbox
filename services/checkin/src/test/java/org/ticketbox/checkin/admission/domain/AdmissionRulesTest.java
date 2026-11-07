package org.ticketbox.checkin.admission.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.util.UUID;

class AdmissionRulesTest {
    @Test
    void admissionBelongsToExactlyOneConcert() {
        UUID concert = UUID.randomUUID();
        Admission admission = new Admission(UUID.randomUUID(), concert);
        assertDoesNotThrow(() -> admission.requireConcert(concert));
        assertThrows(
                IllegalStateException.class, () -> admission.requireConcert(UUID.randomUUID()));
    }
}
