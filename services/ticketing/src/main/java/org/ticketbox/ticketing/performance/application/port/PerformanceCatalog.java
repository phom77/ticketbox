package org.ticketbox.ticketing.performance.application.port;

import java.util.UUID;
import org.ticketbox.ticketing.performance.domain.PerformanceSale;

public interface PerformanceCatalog {
    long apply(PerformanceSale sale);

    /** The same row is shared-locked by stock writers and exclusively locked by activation. */
    boolean usesPerformanceStock(UUID performanceId);
}
