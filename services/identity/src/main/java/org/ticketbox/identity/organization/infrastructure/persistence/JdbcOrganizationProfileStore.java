package org.ticketbox.identity.organization.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.identity.organization.application.port.OrganizationProfileStore;
import org.ticketbox.identity.organization.domain.OrganizationProfile;

import java.util.UUID;

@Repository
class JdbcOrganizationProfileStore implements OrganizationProfileStore {
    private final JdbcTemplate jdbc;

    JdbcOrganizationProfileStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public OrganizationProfile find(UUID organizationId) {
        return jdbc.query("""
                SELECT logo_url, logo_public_id, contact_email, contact_phone, website, legal_name, tax_code,
                       billing_address, reporting_timezone, version
                FROM organization_profiles WHERE organization_id = ?
                """, (rs, row) -> new OrganizationProfile(organizationId, rs.getString("logo_url"),
                rs.getString("logo_public_id"), rs.getString("contact_email"), rs.getString("contact_phone"),
                rs.getString("website"), rs.getString("legal_name"), rs.getString("tax_code"),
                rs.getString("billing_address"), rs.getString("reporting_timezone"), rs.getLong("version")),
                organizationId).stream().findFirst().orElseGet(() -> OrganizationProfile.empty(organizationId));
    }

    @Override
    public boolean save(OrganizationProfile p, long expectedVersion, UUID actor) {
        return jdbc.update("""
                INSERT INTO organization_profiles (organization_id, logo_url, logo_public_id, contact_email,
                    contact_phone, website, legal_name, tax_code, billing_address, reporting_timezone, version,
                    updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, now(), ?)
                ON CONFLICT (organization_id) DO UPDATE SET logo_url = excluded.logo_url,
                    logo_public_id = excluded.logo_public_id, contact_email = excluded.contact_email,
                    contact_phone = excluded.contact_phone, website = excluded.website,
                    legal_name = excluded.legal_name, tax_code = excluded.tax_code,
                    billing_address = excluded.billing_address, reporting_timezone = excluded.reporting_timezone,
                    version = organization_profiles.version + 1, updated_at = now(), updated_by = excluded.updated_by
                WHERE organization_profiles.version = ?
                """, p.organizationId(), p.logoUrl(), p.logoPublicId(), p.contactEmail(), p.contactPhone(),
                p.website(), p.legalName(), p.taxCode(), p.billingAddress(), p.reportingTimezone(), actor,
                expectedVersion) == 1;
    }

    @Override
    public void seedContactEmail(UUID organizationId, String email) {
        jdbc.update("""
                INSERT INTO organization_profiles (organization_id, contact_email) VALUES (?, ?)
                ON CONFLICT (organization_id) DO NOTHING
                """, organizationId, email);
    }
}
