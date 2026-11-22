package org.ticketbox.identity.organization.application.port;

import org.ticketbox.identity.organization.domain.OrganizationGrant;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface OrganizerOnboardingStore {
    record Details(String organizationName, String managerName, String email, String firstEvent) {}
    record Application(UUID id, String organizationName, String managerName, String email, String firstEvent,
                       UUID organizationId, UUID managerId, boolean activationPending) {}
    record Link(UUID id, UUID organizationId, UUID managerId, String email, Set<OrganizationGrant> grants,
                OffsetDateTime expiresAt, boolean delivered) {}
    record Lease(UUID id, UUID leaseId, String email) {}

    void issueApplication(UUID id);
    boolean submit(UUID id, Details details);
    List<Application> applications();
    Optional<Application> lockApplication(UUID id);
    void approve(UUID id, UUID organization, UUID manager, UUID actor);
    List<Link> pending(UUID organization);
    Optional<Link> link(UUID id, boolean lock);
    Optional<Link> activeLink(UUID organization, String email);
    void issueLink(UUID id, UUID organization, UUID manager, String email, Set<OrganizationGrant> grants, UUID actor);
    void consume(UUID id);
    Optional<Lease> claim(UUID lease);
    void finish(UUID id, UUID lease, boolean delivered);
}
