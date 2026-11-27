package org.ticketbox.ticketing.reporting.application.port;

import java.util.Optional;

public interface StatementLogoFetcher {
    /** The image bytes, or empty when the logo is not on an allowed host or cannot be fetched within the limits. */
    Optional<byte[]> fetch(String url);
}
