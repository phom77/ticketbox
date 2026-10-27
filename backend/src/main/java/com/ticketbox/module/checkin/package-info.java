/**
 * Gate check-in module.
 *
 * <p>Responsibilities: online QR scan check-in (atomic via {@code markAsUsedIfValid}),
 * offline sync of check-in logs with signature verification, and check-in history queries.
 *
 * <p>Upstream dependencies:
 * <ul>
 *   <li>{@link com.ticketbox.module.ticket.TicketCheckinPort} – used to atomically mark
 *       tickets as USED and retrieve ticket data for offline dataset download.</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketView} – read model used during scan.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "ticket", "shared"})
package com.ticketbox.module.checkin;
