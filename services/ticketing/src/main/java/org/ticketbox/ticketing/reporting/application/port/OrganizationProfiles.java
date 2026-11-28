package org.ticketbox.ticketing.reporting.application.port;

import java.util.UUID;

/** Identity's organization profile (identity.organization-profile.v1), read only when a statement is issued. */
public interface OrganizationProfiles {
    record Profile(UUID organizationId, String displayName, String legalName, String taxCode, String billingAddress,
                   String contactEmail, String contactPhone, String website, String logoUrl, String logoPngUrl,
                   String reportingTimezone, long version) {}

    /** Throws an AppException (503) when Identity cannot answer. */
    Profile fetch(UUID organizationId);
}
