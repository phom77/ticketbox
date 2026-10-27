/**
 * Notification module.
 *
 * <p>Responsibilities: multi-channel notification delivery (APP in-app, EMAIL via JavaMailSender),
 * delivery status tracking, and 24-hour concert reminders.
 *
 * <p>Cross-module dependencies (consumed via public ports only, never internal types):
 * <ul>
 *   <li>{@code concert} – {@link com.ticketbox.module.concert.ConcertReminderPort} for upcoming concerts</li>
 *   <li>{@code ticket}  – {@link com.ticketbox.module.ticket.TicketReminderRecipientPort} for VALID ticket holders</li>
 *   <li>{@code auth}    – {@link com.ticketbox.module.auth.UserContactPort} for user email/name resolution</li>
 *   <li>{@code shared}  – common utilities and base entities</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "ticket", "auth", "shared"})
package com.ticketbox.module.notification;
