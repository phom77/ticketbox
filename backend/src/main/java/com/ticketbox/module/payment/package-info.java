/**
 * Payment processing module.
 *
 * <p>Upstream dependencies:
 * <ul>
 *   <li>{@code ticket} – uses OrderPort/OrderView to validate order status before processing payment</li>
 *   <li>{@code shared} – common utilities, base entities, and PaymentCompletedEvent</li>
 * </ul>
 *
 * <p>Note: PaymentCompletedEvent lives in {@code shared.event} to avoid a circular dependency
 * with the ticket module (ticket listens to this event while payment uses ticket's OrderPort).
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"ticket", "shared"})
package com.ticketbox.module.payment;
