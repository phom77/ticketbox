package org.ticketbox.identity.organization.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.organization.application.port.OrganizationImageStorage;
import org.ticketbox.identity.organization.application.port.OrganizationProfileStore;
import org.ticketbox.identity.organization.application.port.OrganizationStore;
import org.ticketbox.identity.organization.domain.LogoImage;
import org.ticketbox.identity.organization.domain.OrganizationGrant;
import org.ticketbox.identity.organization.domain.OrganizationProfile;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Reads and edits an organization's profile under the grant rules of ADR 0007. */
@Service
@Transactional(readOnly = true)
public class OrganizationProfiles {
    public record View(OrganizationProfile profile, String displayName, boolean canEditProfile,
                       boolean canEditStatementDetails) {}

    public record ContactChanges(String contactEmail, String contactPhone, String website, String reportingTimezone) {}

    public record StatementDetailChanges(String legalName, String taxCode, String billingAddress) {}

    public record LogoUpload(String contentType, byte[] bytes) {}

    /** A write used an older version. Carries the current profile for the 409 body. */
    public static class ProfileConflict extends RuntimeException {
        private final transient View current;

        public ProfileConflict(View current) {
            super("error.conflict");
            this.current = current;
        }

        public View current() {
            return current;
        }
    }

    private final OrganizationStore organizations;
    private final OrganizationProfileStore profiles;
    private final OrganizationImageStorage images;
    private final TransactionTemplate transaction;

    public OrganizationProfiles(OrganizationStore organizations, OrganizationProfileStore profiles,
                                OrganizationImageStorage images, TransactionTemplate transaction) {
        this.transaction = transaction;
        this.organizations = organizations;
        this.profiles = profiles;
        this.images = images;
    }

    public View view(UUID actor, UUID organization) {
        var grants = organizations.grants(organization, actor);
        if (grants.isEmpty()) throw notFound();
        return view(organization, grants);
    }

    public View platformView(UUID organization) {
        return view(organization, Set.of());
    }

    /** Internal contract read for other services. */
    public View internalView(UUID organization) {
        return view(organization, Set.of());
    }

    @Transactional
    public View updateProfile(UUID actor, UUID organization, ContactChanges changes, long expectedVersion) {
        var grants = lockedGrants(actor, organization);
        if (!grants.contains(OrganizationGrant.MEMBERS)) throw forbidden();
        var current = currentOrConflict(organization, grants, expectedVersion);
        var next = current.withContact(blankToNull(changes.contactEmail()), blankToNull(changes.contactPhone()),
                blankToNull(changes.website()), changes.reportingTimezone().strip());
        List<String> fields = new ArrayList<>();
        diff(fields, "contactEmail", current.contactEmail(), next.contactEmail());
        diff(fields, "contactPhone", current.contactPhone(), next.contactPhone());
        diff(fields, "website", current.website(), next.website());
        diff(fields, "reportingTimezone", current.reportingTimezone(), next.reportingTimezone());
        return write(actor, organization, grants, next, expectedVersion, "PROFILE_UPDATED", fields);
    }

    @Transactional
    public View updateStatementDetails(UUID actor, UUID organization, StatementDetailChanges changes,
                                       long expectedVersion) {
        var grants = lockedGrants(actor, organization);
        if (!grants.contains(OrganizationGrant.MEMBERS) && !grants.contains(OrganizationGrant.FINANCE)) {
            throw forbidden();
        }
        var current = currentOrConflict(organization, grants, expectedVersion);
        var next = current.withStatementDetails(blankToNull(changes.legalName()), blankToNull(changes.taxCode()),
                blankToNull(changes.billingAddress()));
        List<String> fields = new ArrayList<>();
        diff(fields, "legalName", current.legalName(), next.legalName());
        diff(fields, "taxCode", current.taxCode(), next.taxCode());
        diff(fields, "billingAddress", current.billingAddress(), next.billingAddress());
        return write(actor, organization, grants, next, expectedVersion, "STATEMENT_DETAILS_UPDATED", fields);
    }

    /**
     * Validates and uploads the image before the organization row lock is taken, so the lock is never held across
     * a network call. A lost version race or any failure afterwards deletes the uploaded image again.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public View replaceLogo(UUID actor, UUID organization, LogoUpload upload, long expectedVersion) {
        var early = organizations.grants(organization, actor);
        if (early.isEmpty()) throw notFound();
        if (!early.contains(OrganizationGrant.MEMBERS)) throw forbidden();
        var problem = LogoImage.check(upload.bytes(), upload.contentType());
        if (problem != null) {
            throw new AppException(ErrorCode.INVALID_REQUEST, switch (problem) {
                case UNSUPPORTED_TYPE -> "error.logo.unsupported-type";
                case TOO_LARGE -> "error.logo.too-large";
                case TOO_SMALL -> "error.logo.too-small";
                case TYPE_MISMATCH -> "error.logo.type-mismatch";
                case EMPTY -> "error.logo.required";
            });
        }
        if (profiles.find(organization).version() != expectedVersion) {
            throw new ProfileConflict(view(organization, early));
        }
        var stored = images.uploadLogo(organization, upload.bytes());
        try {
            return transaction.execute(status -> {
                var grants = lockedGrants(actor, organization);
                if (!grants.contains(OrganizationGrant.MEMBERS)) throw forbidden();
                var current = currentOrConflict(organization, grants, expectedVersion);
                var next = current.withLogo(stored.secureUrl(), stored.publicId());
                var view = write(actor, organization, grants, next, expectedVersion, "LOGO_REPLACED", List.of("logo"));
                deleteAfterCommit(current.logoPublicId());
                return view;
            });
        } catch (RuntimeException failed) {
            images.deleteBestEffort(stored.publicId());
            throw failed;
        }
    }

    @Transactional
    public View removeLogo(UUID actor, UUID organization, long expectedVersion) {
        var grants = lockedGrants(actor, organization);
        if (!grants.contains(OrganizationGrant.MEMBERS)) throw forbidden();
        var current = currentOrConflict(organization, grants, expectedVersion);
        if (current.logoUrl() == null) return view(organization, grants);
        var view = write(actor, organization, grants, current.withLogo(null, null), expectedVersion,
                "LOGO_REMOVED", List.of("logo"));
        deleteAfterCommit(current.logoPublicId());
        return view;
    }

    private View write(UUID actor, UUID organization, Set<OrganizationGrant> grants, OrganizationProfile next,
                       long expectedVersion, String action, List<String> fields) {
        if (fields.isEmpty()) return view(organization, grants);
        if (!profiles.save(next, expectedVersion, actor)) throw new ProfileConflict(view(organization, grants));
        organizations.auditFields(organization, actor, action, fields);
        return view(organization, grants);
    }

    private OrganizationProfile currentOrConflict(UUID organization, Set<OrganizationGrant> grants, long expected) {
        var current = profiles.find(organization);
        if (current.version() != expected) throw new ProfileConflict(view(organization, grants));
        return current;
    }

    private Set<OrganizationGrant> lockedGrants(UUID actor, UUID organization) {
        if (!organizations.lock(organization)) throw notFound();
        var grants = organizations.grants(organization, actor);
        if (grants.isEmpty()) throw notFound();
        return grants;
    }

    private View view(UUID organization, Set<OrganizationGrant> grants) {
        String name = organizations.displayName(organization).orElseThrow(OrganizationProfiles::notFound);
        boolean members = grants.contains(OrganizationGrant.MEMBERS);
        return new View(profiles.find(organization), name, members,
                members || grants.contains(OrganizationGrant.FINANCE));
    }

    private void deleteAfterCommit(String publicId) {
        if (publicId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            images.deleteBestEffort(publicId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                images.deleteBestEffort(publicId);
            }
        });
    }

    private static void diff(List<String> fields, String name, String before, String after) {
        if (!Objects.equals(before, after)) fields.add(name);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static AppException notFound() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.resource-not-found");
    }

    private static AppException forbidden() {
        return new AppException(ErrorCode.FORBIDDEN, "error.forbidden");
    }
}
