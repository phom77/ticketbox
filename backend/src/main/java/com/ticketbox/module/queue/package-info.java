/**
 * Waiting room and sale queue module.
 *
 * <p>Responsibilities: audience queue admission before ticket selection, Redis-backed
 * shopping-session tokens, and server-side validation for purchase entry.
 *
 * <p>Upstream dependencies:
 * <ul>
 *   <li>{@code concert} - validates that the target concert exists and is on sale.</li>
 *   <li>{@code shared} - common exceptions and Redis key constants.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "shared"})
package com.ticketbox.module.queue;
