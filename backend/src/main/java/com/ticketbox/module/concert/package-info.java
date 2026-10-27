/**
 * Concert catalog and event management module.
 *
 * <p>Public API (module root):
 * <ul>
 *   <li>{@link com.ticketbox.module.concert.ConcertOrderPort} – consumed by ticket module for
 *       order validation. Stock mutations use InventoryPort owned by Ticketing.</li>
 *   <li>{@link com.ticketbox.module.concert.ConcertView} – read model for concert data.</li>
 *   <li>{@link com.ticketbox.module.concert.TicketTypeView} – read model for ticket type data.</li>
 *   <li>{@link com.ticketbox.module.concert.ConcertReportingPort} – consumed by admin module
 *       for organizer revenue reporting.</li>
 *   <li>{@link com.ticketbox.module.concert.ConcertReportingView} – reporting read model.</li>
 *   <li>{@link com.ticketbox.module.concert.TicketTypeReportingView} – reporting read model.</li>
 *   <li>{@link com.ticketbox.module.concert.ConcertReminderPort} – consumed by notification module
 *       to find concerts starting within the next 24 hours.</li>
 *   <li>{@link com.ticketbox.module.concert.ConcertReminderView} – read model for reminder data.</li>
 * </ul>
 *
 * <p>Responsibilities: concert lifecycle (DRAFT → ON_SALE → COMPLETED/CANCELLED),
 * ticket-type configuration, seat map management, and caching.
 */
@org.springframework.modulith.ApplicationModule
package com.ticketbox.module.concert;
