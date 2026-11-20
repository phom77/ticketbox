package org.ticketbox.ticketing.issuance.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface TicketPlaces {
    Map<UUID, Place> forTickets(List<UUID> ticketIds);

    record Place(UUID performanceId, UUID eventId, String title, String venueName, OffsetDateTime startsAt,
                 String offerName, String sectionLabel, String rowLabel, String seatLabel) {}
}
