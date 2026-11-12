package org.ticketbox.identity.organization.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.organization.application.port.OrganizationStore;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Invitation;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Member;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Membership;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Organization;
import org.ticketbox.identity.organization.domain.OrganizationGrant;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class OrganizationService {
    private static final Set<OrganizationGrant> INITIAL_GRANTS =
            Set.of(OrganizationGrant.MEMBERS, OrganizationGrant.EVENTS, OrganizationGrant.FINANCE);

    private final OrganizationStore store;
    private final UserRepository accounts;

    public OrganizationService(OrganizationStore store, UserRepository accounts) {
        this.store = store;
        this.accounts = accounts;
    }

    @Transactional
    public UUID approve(UUID actor, String name, UUID manager) {
        String normalizedName = name.strip();
        requireActiveAccount(manager);
        Organization organization = new Organization(UUID.randomUUID(), normalizedName, manager);
        if (!store.insert(organization)) {
            Organization existing = store.findByName(normalizedName).orElseThrow();
            if (!existing.initialManagerId().equals(manager)) {
                throw conflict();
            }
            return existing.id();
        }
        store.saveGrants(organization.id(), manager, INITIAL_GRANTS);
        store.audit(organization.id(), actor, manager, "APPROVED", INITIAL_GRANTS);
        return organization.id();
    }

    @Transactional
    public void recover(UUID actor, UUID organization, UUID manager) {
        if (!store.lock(organization)) {
            throw notFound();
        }
        if (store.members(organization).stream().anyMatch(this::activeManager)) {
            throw conflict();
        }
        requireActiveAccount(manager);
        store.saveGrants(organization, manager, INITIAL_GRANTS);
        store.invalidateInvitations(organization, manager);
        store.audit(organization, actor, manager, "MANAGER_RECOVERED", INITIAL_GRANTS);
    }

    public List<Membership> memberships(UUID actor) {
        return store.memberships(actor);
    }

    public List<Organization> organizations() {
        return store.organizations();
    }

    public List<Member> members(UUID actor, UUID organization) {
        requireManager(actor, organization);
        return store.members(organization);
    }

    public Set<OrganizationGrant> access(UUID actor, UUID organization) {
        Set<OrganizationGrant> grants = store.grants(organization, actor);
        if (grants.isEmpty()) {
            throw forbidden();
        }
        return grants;
    }

    @Transactional
    public InviteCode invite(UUID actor, UUID organization, UUID target, Set<OrganizationGrant> grants) {
        lockAndRequireManager(actor, organization);
        requireActiveAccount(target);
        if (!store.grants(organization, target).isEmpty()) {
            throw conflict();
        }
        String code = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plus(Duration.ofHours(24));
        store.invalidateInvitations(organization, target);
        store.saveInvitation(hash(code), new Invitation(organization, target, grants, expiresAt, false));
        store.audit(organization, actor, target, "INVITED", grants);
        return new InviteCode(code, expiresAt);
    }

    @Transactional
    public UUID accept(UUID actor, String code) {
        String codeHash = hash(code);
        Invitation beforeLock = store.findInvitation(codeHash).orElseThrow(this::notFound);
        if (!beforeLock.accountId().equals(actor) || !store.lock(beforeLock.organizationId())) {
            throw notFound();
        }
        Invitation invitation = store.findInvitation(codeHash).orElseThrow(this::notFound);
        if (!invitation.expiresAt().isAfter(Instant.now())) {
            throw notFound();
        }
        UUID organization = invitation.organizationId();
        if (invitation.consumed()) {
            access(actor, organization);
            return organization;
        }
        if (!store.grants(organization, actor).isEmpty()) {
            throw conflict();
        }
        store.saveGrants(organization, actor, invitation.grants());
        store.consumeInvitation(codeHash);
        store.audit(organization, actor, actor, "INVITATION_ACCEPTED", invitation.grants());
        return organization;
    }

    @Transactional
    public void updateMember(UUID actor, UUID organization, UUID target, Set<OrganizationGrant> grants) {
        lockAndRequireManager(actor, organization);
        Set<OrganizationGrant> previous = store.grants(organization, target);
        if (previous.isEmpty()) {
            throw notFound();
        }
        if (previous.equals(grants)) {
            return;
        }
        if (previous.contains(OrganizationGrant.MEMBERS) && !grants.contains(OrganizationGrant.MEMBERS)
                && store.members(organization).stream()
                        .noneMatch(member -> !target.equals(member.accountId()) && activeManager(member))) {
            throw conflict();
        }
        store.saveGrants(organization, target, grants);
        store.invalidateInvitations(organization, target);
        store.audit(organization, actor, target, "GRANTS_UPDATED", grants);
    }

    private void lockAndRequireManager(UUID actor, UUID organization) {
        if (!store.lock(organization)) {
            throw forbidden();
        }
        requireManager(actor, organization);
    }

    private void requireManager(UUID actor, UUID organization) {
        if (!access(actor, organization).contains(OrganizationGrant.MEMBERS)) {
            throw forbidden();
        }
    }

    private void requireActiveAccount(UUID account) {
        accounts.findById(account).filter(User::isActive).orElseThrow(this::notFound);
    }

    private boolean activeManager(Member member) {
        return member.active() && member.grants().contains(OrganizationGrant.MEMBERS);
    }

    private String hash(String code) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private AppException forbidden() {
        return new AppException(ErrorCode.FORBIDDEN, "error.forbidden");
    }

    private AppException notFound() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.resource-not-found");
    }

    private AppException conflict() {
        return new AppException(ErrorCode.CONFLICT, "error.conflict");
    }

    public record InviteCode(String code, Instant expiresAt) {}
}
