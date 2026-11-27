package org.ticketbox.ticketing.web.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import java.time.ZoneId;

class OrganizationAccessZoneTest {
    @Test
    void usesTheReportedZoneAndFallsBackToHoChiMinhWhenAbsentOrInvalid() {
        assertThat(OrganizationAccess.reportingZone("Asia/Bangkok")).isEqualTo(ZoneId.of("Asia/Bangkok"));
        assertThat(OrganizationAccess.reportingZone(null)).isEqualTo(ZoneId.of("Asia/Ho_Chi_Minh"));
        assertThat(OrganizationAccess.reportingZone("  ")).isEqualTo(ZoneId.of("Asia/Ho_Chi_Minh"));
        assertThat(OrganizationAccess.reportingZone("Mars/Olympus")).isEqualTo(ZoneId.of("Asia/Ho_Chi_Minh"));
    }
}
