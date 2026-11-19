package org.ticketbox.ticketing.queue.application.port;

import java.util.UUID;

public interface AdmissionHealth {
    enum Path {
        RESERVE, CHECKOUT, PAYMENT
    }

    boolean enabled();

    void record(UUID concert, Path path, boolean slow, boolean failure, boolean unavailable);
}
