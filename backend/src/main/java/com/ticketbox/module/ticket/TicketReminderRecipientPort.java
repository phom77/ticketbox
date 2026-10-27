package com.ticketbox.module.ticket;

import java.util.List;
import java.util.UUID;

/**
 * Public port exposed by the {@code ticket} module.
 *
 * <p>Consumed by the {@code notification} module to resolve the list of users
 * who hold a valid ticket for a concert, so that reminder notifications
 * can be dispatched to each of them.
 */
public interface TicketReminderRecipientPort {

    /**
     * Returns the distinct user IDs that hold at least one {@code VALID} ticket
     * for the given concert.
     *
     * <p>Only {@code VALID} tickets are considered: tickets with status {@code USED}
     * have already been scanned at the gate, so sending a 24-hour reminder would be
     * redundant or confusing.
     *
     * @param concertId the concert to look up
     * @return distinct user IDs with valid tickets; never null, may be empty
     */
    List<UUID> findDistinctUserIdsByConcertId(UUID concertId);
}
