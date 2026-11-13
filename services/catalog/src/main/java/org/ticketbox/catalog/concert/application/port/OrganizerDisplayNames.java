package org.ticketbox.catalog.concert.application.port;

import java.util.Optional;
import java.util.UUID;

public interface OrganizerDisplayNames {
    Optional<String> find(UUID organization);
}
