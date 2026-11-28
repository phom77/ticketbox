package org.ticketbox.identity.organization.domain;

import java.util.UUID;

/** Profile data an organization keeps next to its approved display name. */
public record OrganizationProfile(UUID organizationId, String logoUrl, String logoPublicId, String contactEmail,
                                  String contactPhone, String website, String legalName, String taxCode,
                                  String billingAddress, String reportingTimezone, long version) {
    public static final String DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

    public static OrganizationProfile empty(UUID organizationId) {
        return new OrganizationProfile(organizationId, null, null, null, null, null, null, null, null,
                DEFAULT_TIMEZONE, 0);
    }

    public OrganizationProfile withContact(String email, String phone, String site, String timezone) {
        return new OrganizationProfile(organizationId, logoUrl, logoPublicId, email, phone, site, legalName,
                taxCode, billingAddress, timezone, version);
    }

    public OrganizationProfile withStatementDetails(String legal, String tax, String address) {
        return new OrganizationProfile(organizationId, logoUrl, logoPublicId, contactEmail, contactPhone,
                website, legal, tax, address, reportingTimezone, version);
    }

    public OrganizationProfile withLogo(String url, String publicId) {
        return new OrganizationProfile(organizationId, url, publicId, contactEmail, contactPhone, website,
                legalName, taxCode, billingAddress, reportingTimezone, version);
    }

    /** A 400 px wide PNG rendition of a Cloudinary logo, because PDF writers cannot embed WebP. */
    public String logoPngUrl() {
        if (logoUrl == null) return null;
        String marker = "/image/upload/";
        int at = logoUrl.indexOf(marker);
        if (!logoUrl.startsWith("https://res.cloudinary.com/") || at < 0) return null;
        int end = at + marker.length();
        return logoUrl.substring(0, end) + "f_png,w_400,c_limit/" + logoUrl.substring(end);
    }
}
