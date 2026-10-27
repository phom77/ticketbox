/**
 * Guest-list operations and organizer reporting module.
 *
 * <p>Responsibilities: organizer revenue summary, per-zone revenue breakdown, daily sales
 * trends, completed-concert reporting, CSV guest-list imports, and guest check-in.
 * Reporting reads ticket sales and concert data exposed via cross-module ports;
 * guest-list operations own their import and attendance records.
 *
 * <p>Upstream dependencies:
 * <ul>
 *   <li>{@link com.ticketbox.module.concert.ConcertReportingPort} – owned-concert queries.</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketSalesReportingPort} – revenue aggregates.</li>
 *   <li>{@code shared} – common utilities.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "ticket", "shared"})
package com.ticketbox.module.admin;
