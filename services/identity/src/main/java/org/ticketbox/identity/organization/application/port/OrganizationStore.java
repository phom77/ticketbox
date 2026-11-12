package org.ticketbox.identity.organization.application.port;

import org.ticketbox.identity.organization.domain.OrganizationGrant;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface OrganizationStore {
    record Organization(UUID id, String name, UUID initialManagerId) {}

    record Membership(UUID id, String name, Set<OrganizationGrant> grants) {}

    record Member(UUID accountId, Set<OrganizationGrant> grants, boolean active) {}

    record Invitation(UUID organizationId, UUID accountId, Set<OrganizationGrant> grants,
                      Instant expiresAt, boolean consumed) {}

    boolean insert(Organization organization);

    Optional<Organization> findByName(String name);

    List<Organization> organizations();

    boolean lock(UUID organizationId);

    List<Membership> memberships(UUID accountId);

    List<Member> members(UUID organizationId);

    Set<OrganizationGrant> grants(UUID organizationId, UUID accountId);

    void saveGrants(UUID organizationId, UUID accountId, Set<OrganizationGrant> grants);

    void invalidateInvitations(UUID organizationId, UUID accountId);

    void saveInvitation(String codeHash, Invitation invitation);

    Optional<Invitation> findInvitation(String codeHash);

    void consumeInvitation(String codeHash);

    void audit(UUID organizationId, UUID actorId, UUID targetId, String action,
               Set<OrganizationGrant> grants);
}
