package org.ticketbox.identity.organization.application.port;

import org.ticketbox.identity.organization.domain.OrganizationProfile;

import java.util.UUID;

public interface OrganizationProfileStore {
    /** The saved profile, or an empty profile (version 0) when none was saved. */
    OrganizationProfile find(UUID organizationId);

    /** Inserts or updates the profile when its stored version still equals {@code expectedVersion}. */
    boolean save(OrganizationProfile profile, long expectedVersion, UUID actor);

    /** Stores the application email as the first contact email unless a row exists. */
    void seedContactEmail(UUID organizationId, String email);
}
