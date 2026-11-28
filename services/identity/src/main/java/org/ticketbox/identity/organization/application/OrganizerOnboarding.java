package org.ticketbox.identity.organization.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.organization.application.port.OrganizationProfileStore;
import org.ticketbox.identity.organization.application.port.OrganizationStore;
import org.ticketbox.identity.organization.application.port.OrganizationStore.Organization;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Application;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Details;
import org.ticketbox.identity.organization.application.port.OrganizerOnboardingStore.Link;
import org.ticketbox.identity.organization.domain.OrganizationGrant;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class OrganizerOnboarding {
    public record Mail(UUID id, UUID leaseId, String email, String token) {}
    public record InviteResult(String email, String outcome) {}

    private static final Set<OrganizationGrant> MANAGER = Set.of(OrganizationGrant.MEMBERS, OrganizationGrant.EVENTS, OrganizationGrant.FINANCE);
    private final OrganizerOnboardingStore store;
    private final OrganizationStore organizations;
    private final OrganizationProfileStore profiles;
    private final UserRepository accounts;
    private final PasswordEncoder passwords;
    private final SecretKeySpec signingKey;

    public OrganizerOnboarding(OrganizerOnboardingStore store, OrganizationStore organizations, OrganizationProfileStore profiles,
            UserRepository accounts, PasswordEncoder passwords, @Value("${ticketbox.reset.key:}") String key) {
        this.store = store;
        this.organizations = organizations;
        this.profiles = profiles;
        this.accounts = accounts;
        this.passwords = passwords;
        signingKey = key.isBlank() ? null : new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Transactional
    public String issueApplication() {
        UUID id = UUID.randomUUID();
        String token = sign("application", id);
        store.issueApplication(id);
        return token;
    }

    @Transactional
    public void submit(String token, Details details) {
        Details normalized = new Details(details.organizationName().strip(), details.managerName().strip(),
                normalize(details.email()), details.firstEvent().strip());
        if (!store.submit(verify("application", token), normalized)) throw notFound();
    }

    public List<Application> applications() {
        return store.applications();
    }

    @Transactional
    public UUID approve(UUID id, UUID actor) {
        var application = store.lockApplication(id).orElseThrow(OrganizerOnboarding::notFound);
        if (application.organizationId() != null) return application.organizationId();
        requireDelivery();
        if (!accounts.findTop2ByEmailIgnoreCase(application.email()).isEmpty()) {
            throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS, "error.email-already-exists");
        }
        User manager = newOrganizer(application.email(), application.managerName(), UUID.randomUUID().toString(), false);
        UUID organization = UUID.randomUUID();
        if (!organizations.insert(new Organization(organization, application.organizationName(), manager.getId()))) {
            throw new AppException(ErrorCode.CONFLICT, "error.conflict");
        }
        organizations.audit(organization, actor, manager.getId(), "APPROVED", MANAGER);
        profiles.seedContactEmail(organization, application.email());
        store.approve(id, organization, manager.getId(), actor);
        issue(organization, manager.getId(), application.email(), MANAGER, actor);
        return organization;
    }

    @Transactional
    public void resendManager(UUID id, UUID actor) {
        var application = store.lockApplication(id).orElseThrow(OrganizerOnboarding::notFound);
        if (application.managerId() == null || !organizations.lock(application.organizationId())
                || store.pending(application.organizationId()).stream()
                    .noneMatch(link -> application.managerId().equals(link.managerId()))) throw notFound();
        issue(application.organizationId(), application.managerId(), application.email(), MANAGER, actor);
    }

    public List<Link> pending(UUID organization, UUID actor) {
        requireManager(organization, actor);
        return store.pending(organization).stream().filter(link -> link.managerId() == null).toList();
    }

    public List<Link> platformPending(UUID organization) {
        if (organizations.displayName(organization).isEmpty()) throw notFound();
        return store.pending(organization);
    }

    @Transactional
    public List<InviteResult> invite(UUID organization, UUID actor, List<String> recipients, Set<OrganizationGrant> grants) {
        if (!organizations.lock(organization)) throw notFound();
        requireManager(organization, actor);
        requireDelivery();
        return recipients.stream().map(OrganizerOnboarding::normalize).distinct()
                .map(email -> invite(organization, actor, email, grants)).toList();
    }

    @Transactional
    public void resend(UUID organization, UUID actor, String email) {
        if (!organizations.lock(organization)) throw notFound();
        requireManager(organization, actor);
        var invitation = store.pending(organization).stream().filter(link -> link.managerId() == null
                && link.email().equals(normalize(email))).findFirst().orElseThrow(OrganizerOnboarding::notFound);
        issue(organization, null, invitation.email(), invitation.grants(), actor);
    }

    @Transactional
    public InviteResult migrateMember(UUID organization, UUID actor, UUID member, String email) {
        if (!organizations.lock(organization)) throw notFound();
        var legacy = accounts.findById(member).filter(account -> account.getRole() == User.Role.AUDIENCE);
        var grants = organizations.grants(organization, member);
        if (legacy.isEmpty() || grants.isEmpty()) throw notFound();
        return invite(organization, actor, normalize(email), grants);
    }

    @Transactional
    public void activate(String token, String name, String password, UUID signedIn) {
        UUID id = verify("activation", token);
        var target = store.link(id, false).orElseThrow(OrganizerOnboarding::notFound);
        if (!organizations.lock(target.organizationId())) throw notFound();
        var link = store.link(id, true).orElseThrow(OrganizerOnboarding::notFound);
        User account = link.managerId() == null ? acceptedEmployee(link, name, password, signedIn)
                : activateManager(link, password);
        if (organizations.grants(link.organizationId(), account.getId()).isEmpty()) {
            organizations.saveGrants(link.organizationId(), account.getId(), link.grants());
            organizations.audit(link.organizationId(), account.getId(), account.getId(), "INVITATION_ACCEPTED", link.grants());
        }
        store.consume(id);
    }

    @Transactional
    public Optional<Mail> claim() {
        if (signingKey == null) return Optional.empty();
        return store.claim(UUID.randomUUID())
                .map(link -> new Mail(link.id(), link.leaseId(), link.email(), sign("activation", link.id())));
    }

    @Transactional
    public void finish(UUID id, UUID lease, boolean delivered) {
        store.finish(id, lease, delivered);
    }

    private InviteResult invite(UUID organization, UUID actor, String email, Set<OrganizationGrant> grants) {
        if (email.length() > 254 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) return new InviteResult(email, "INVALID");
        var matches = accounts.findTop2ByEmailIgnoreCase(email);
        if (matches.size() > 1 || (matches.size() == 1 && (!canAccept(matches.getFirst(), grants)
                || !matches.getFirst().isActive()))) return new InviteResult(email, "UNAVAILABLE");
        if (matches.size() == 1 && !organizations.grants(organization, matches.getFirst().getId()).isEmpty()) {
            return new InviteResult(email, "MEMBER");
        }
        if (store.activeLink(organization, email).isPresent()) return new InviteResult(email, "PENDING");
        issue(organization, null, email, grants, actor);
        return new InviteResult(email, "QUEUED");
    }

    private User acceptedEmployee(Link link, String name, String password, UUID signedIn) {
        var matches = accounts.findTop2ByEmailIgnoreCase(link.email());
        if (matches.isEmpty()) {
            if (name == null || name.isBlank() || name.length() > 160) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
            }
            var role = link.grants().equals(Set.of(OrganizationGrant.ADMISSION)) ? User.Role.STAFF : User.Role.ORGANIZER;
            return newAccount(link.email(), name.strip(), validPassword(password), true, role);
        }
        if (matches.size() == 1) {
            var organizer = accounts.findByIdForUpdate(matches.getFirst().getId()).orElseThrow(OrganizerOnboarding::notFound);
            if (organizer.isActive() && canAccept(organizer, link.grants()) && organizer.getId().equals(signedIn)) {
                return organizer;
            }
        }
        throw new AppException(ErrorCode.FORBIDDEN, "error.organizer.sign-in-to-accept");
    }

    private User activateManager(Link link, String password) {
        var manager = accounts.findByIdForUpdate(link.managerId()).orElseThrow(OrganizerOnboarding::notFound);
        if (manager.isActive() || manager.getRole() != User.Role.ORGANIZER || !manager.getEmail().equals(link.email())) {
            throw notFound();
        }
        manager.resetPassword(passwords.encode(validPassword(password)));
        manager.changeActivity(true);
        return manager;
    }

    private static boolean canAccept(User account, Set<OrganizationGrant> grants) {
        return account.getRole() == User.Role.ORGANIZER
                || (account.getRole() == User.Role.STAFF && grants.equals(Set.of(OrganizationGrant.ADMISSION)));
    }

    private User newOrganizer(String email, String name, String password, boolean active) {
        return newAccount(email, name, password, active, User.Role.ORGANIZER);
    }

    private User newAccount(String email, String name, String password, boolean active, User.Role role) {
        User user = User.register(email, name, passwords.encode(password), null);
        user.changeRole(role);
        user.changeActivity(active);
        User registered = accounts.save(user);
        accounts.flush();
        return registered;
    }

    private void issue(UUID organization, UUID manager, String email, Set<OrganizationGrant> grants, UUID actor) {
        requireDelivery();
        store.issueLink(UUID.randomUUID(), organization, manager, email, grants, actor);
    }

    private void requireManager(UUID organization, UUID actor) {
        if (!organizations.grants(organization, actor).contains(OrganizationGrant.MEMBERS)) {
            throw new AppException(ErrorCode.FORBIDDEN, "error.forbidden");
        }
    }

    private static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private static String validPassword(String password) {
        if (password == null || password.isBlank() || password.length() < 8
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.organizer.password-invalid");
        }
        return password;
    }

    private UUID verify(String purpose, String token) {
        if (token == null || !token.matches("[0-9a-f-]{36}\\.[A-Za-z0-9_-]{43}")) throw notFound();
        UUID id;
        try {
            id = UUID.fromString(token.substring(0, 36));
        } catch (IllegalArgumentException invalid) {
            throw notFound();
        }
        if (!MessageDigest.isEqual(sign(purpose, id).getBytes(StandardCharsets.US_ASCII),
                token.getBytes(StandardCharsets.US_ASCII))) throw notFound();
        return id;
    }

    private String sign(String purpose, UUID id) {
        requireDelivery();
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(signingKey);
            byte[] digest = mac.doFinal(("organizer:" + purpose + ":" + id).getBytes(StandardCharsets.US_ASCII));
            return id + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Organizer link signing failed", error);
        }
    }

    private void requireDelivery() {
        if (signingKey == null) throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "error.organizer.delivery-unavailable");
    }

    private static AppException notFound() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.organizer.link-unavailable");
    }
}
