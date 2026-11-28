package org.ticketbox.ticketing.reporting.application.port;

import org.ticketbox.ticketing.reporting.domain.SettlementStatement;

public interface StatementRenderer {
    /** {@code logo} (PNG or JPEG bytes) may be null. */
    byte[] pdf(SettlementStatement statement, byte[] logo);

    byte[] csv(SettlementStatement statement);
}
