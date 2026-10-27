package com.ticketbox.module.auth;

import java.util.Optional;
import java.util.UUID;

/**
 * Public port exposed by the {@code auth} module.
 *
 * <p>Consumed by the {@code notification} module to resolve contact details
 * (email address and display name) needed to deliver email notifications.
 * Other modules reference users by UUID only and never import User entity directly.
 */
public interface UserContactPort {

    /**
     * Returns the contact information for the given user, or {@code empty} if the user
     * does not exist or is not active.
     *
     * @param userId the user's UUID
     * @return an {@link Optional} containing contact details, or empty
     */
    Optional<UserContactView> findById(UUID userId);
}
