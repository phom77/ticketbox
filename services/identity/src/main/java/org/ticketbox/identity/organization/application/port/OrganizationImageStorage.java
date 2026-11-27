package org.ticketbox.identity.organization.application.port;

import java.util.UUID;

public interface OrganizationImageStorage {
    record StoredImage(String secureUrl, String publicId) {}

    /** Stores a validated logo. Throws an AppException with IMAGE_STORAGE_UNAVAILABLE when it cannot. */
    StoredImage uploadLogo(UUID organizationId, byte[] bytes);

    void deleteBestEffort(String publicId);
}
