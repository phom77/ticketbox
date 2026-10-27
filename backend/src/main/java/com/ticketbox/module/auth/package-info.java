/**
 * Authentication and identity module.
 *
 * <p>Responsibilities: user registration, login with BCrypt password verification,
 * JWT token issuance, and current-user profile retrieval.
 *
 * <p>This module owns the {@code users} table and the {@link com.ticketbox.module.auth.domain.User}
 * aggregate. Other modules reference users by UUID only and never import from this module.
 *
 * <p>Public API (module root):
 * <ul>
 *   <li>{@link com.ticketbox.module.auth.UserContactPort} – consumed by notification module
 *       to resolve user email and display name for email delivery.</li>
 *   <li>{@link com.ticketbox.module.auth.UserContactView} – read model for contact data.</li>
 * </ul>
 */
@org.springframework.modulith.ApplicationModule
package com.ticketbox.module.auth;
