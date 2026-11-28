package org.ticketbox.catalog.web.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;

class OrganizerLegacyGuardTest {
    private static final String BASE = "/api/organizer/manage";
    private static final String ID = "/4b6a1ad1-7a5a-4bde-a3a4-0d2b2d1f5c11";
    private final OrganizerLegacyGuard guard = new OrganizerLegacyGuard(true);

    private boolean allowed(OrganizerLegacyGuard guard, String method, String path) {
        return guard.preHandle(new MockHttpServletRequest(method, path), new MockHttpServletResponse(), new Object());
    }

    @Test
    void organizerWritesToLegacyConcertsAreRefusedWith403Semantics() {
        for (var write : new String[][] {
                {"POST", BASE + "/concerts"}, {"PUT", BASE + "/concerts" + ID}, {"DELETE", BASE + "/concerts" + ID},
                {"PATCH", BASE + "/concerts" + ID + "/status"}, {"PUT", BASE + "/concerts" + ID + "/poster"},
                {"DELETE", BASE + "/concerts" + ID + "/poster"}, {"PUT", BASE + "/concerts" + ID + "/category"},
                {"POST", BASE + "/concerts" + ID + "/ticket-types"}, {"PUT", BASE + "/ticket-types" + ID},
                {"PATCH", BASE + "/ticket-types" + ID + "/status"}, {"DELETE", BASE + "/ticket-types" + ID},
                {"POST", BASE + "/concerts" + ID + "/publication"},
                {"POST", BASE + "/concerts" + ID + "/artist-bio-jobs"},
                {"POST", BASE + "/concerts" + ID + "/artist-bio-jobs/compose"},
                {"PUT", BASE + "/concerts" + ID + "/artist-bio"}}) {
            assertThatThrownBy(() -> allowed(guard, write[0], write[1]))
                    .describedAs(write[0] + " " + write[1])
                    .isInstanceOfSatisfying(AppException.class, error -> {
                        assertThat(error.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED);
                        assertThat(error.getMessage()).isEqualTo("error.concert.organizer-legacy-read-only");
                    });
        }
    }

    @Test
    void readsNativeRoutesPublicationAndJobsByIdPassTheGuard() {
        assertThat(allowed(guard, "GET", BASE + "/concerts")).isTrue();
        assertThat(allowed(guard, "GET", BASE + "/concerts" + ID + "/ticket-types")).isTrue();
        assertThat(allowed(guard, "GET", BASE + "/concerts" + ID + "/category")).isTrue();
        assertThat(allowed(guard, "GET", BASE + "/concerts" + ID + "/publication")).isTrue();
        assertThat(allowed(guard, "POST", BASE + "/artist-bio-jobs" + ID + "/apply")).isTrue();
        assertThat(allowed(guard, "POST", BASE + "/v2/events")).isTrue();
        assertThat(allowed(guard, "PUT", BASE + "/v2/events" + ID + "/poster")).isTrue();
        assertThat(allowed(guard, "POST", "/api/admin/concerts")).isTrue();
        assertThat(allowed(guard, "PUT", "/api/admin/concerts" + ID)).isTrue();
    }

    @Test
    void theRollbackFlagReopensLegacyWrites() {
        assertThat(allowed(new OrganizerLegacyGuard(false), "POST", BASE + "/concerts")).isTrue();
    }
}
