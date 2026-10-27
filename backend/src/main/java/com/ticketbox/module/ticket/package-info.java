/**
 * Ticket inventory and order module.
 *
 * <p>Public API (module root):
 * <ul>
 *   <li>{@link com.ticketbox.module.ticket.OrderPort} – consumed by payment module</li>
 *   <li>{@link com.ticketbox.module.ticket.OrderView} – consumed by payment module</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketCheckinPort} – consumed by checkin module</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketView} – consumed by checkin module</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketSalesReportingPort} – consumed by admin module</li>
 *   <li>{@link com.ticketbox.module.ticket.RevenueSummaryView} – consumed by admin module</li>
 *   <li>{@link com.ticketbox.module.ticket.SalesTrendView} – consumed by admin module</li>
 *   <li>{@link com.ticketbox.module.ticket.ZoneRevenueView} – consumed by admin module</li>
 *   <li>{@link com.ticketbox.module.ticket.TicketReminderRecipientPort} – consumed by notification module
 *       to find VALID ticket holders for 24-hour concert reminders.</li>
 * </ul>
 *
 * <p>Upstream dependencies:
 * <ul>
 *   <li>{@code concert} – reads concert/ticket-type data for order validation</li>
 *   <li>{@code shared} – common utilities, base entities, and PaymentCompletedEvent</li>
 * </ul>
 *
 * <p>Note: No longer depends on {@code payment} directly.
 * PaymentCompletedEvent lives in {@code shared.event} to break the former circular dependency.
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "queue", "inventory", "shared"})
package com.ticketbox.module.ticket;
