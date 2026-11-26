package org.ticketbox.catalog.performance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.domain.EventContentRevision.Action;
import org.ticketbox.catalog.performance.domain.EventContentRevision.PosterEdit;
import org.ticketbox.catalog.performance.domain.EventContentRevision.State;

class EventContentRevisionTest {
    private final UUID event = UUID.randomUUID();
    private final OffsetDateTime now = OffsetDateTime.now();

    private EventContent content(String description) {
        return EventContent.authored("Title", description, Map.of(), null, null, null);
    }

    @Test
    void contentIsNormalizedAndValidated() {
        var value = EventContent.authored(" Title ", "d", Map.of("vi", new ConcertText(" ", null)), " ", " ", "");
        assertThat(value.title()).isEqualTo("Title");
        assertThat(value.translations()).isEmpty();
        assertThat(value.artistBio()).isNull();
        assertThat(value.ageRating()).isNull();
        assertThat(value.refundPolicy()).isNull();
        assertThatThrownBy(() -> EventContent.authored(" ", null, null, null, null, null))
                .isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> EventContent.authored("t", null, null, null, null, "x".repeat(2001)))
                .hasMessage("error.event-content.invalid-refund-policy");
        assertThatThrownBy(() -> EventContent.authored("t", null, null, null, "12+", null))
                .hasMessage("error.event-content.invalid-age-rating");
    }

    @Test
    void everyEditIsANewRevisionAndReviewHoldsTheTextStill() {
        var first = EventContentRevision.start(event, 3, content("a"), PosterEdit.unchanged());
        var submitted = first.submit(UUID.randomUUID(), now);
        assertThat(submitted.state()).isEqualTo(State.SUBMITTED);
        assertThatThrownBy(() -> submitted.edited(3, content("b"), PosterEdit.unchanged()))
                .hasMessage("error.event-content.revision-in-review");
        assertThat(submitted.withdraw().state()).isEqualTo(State.DRAFTING);
        var edited = first.edited(4, content("b"), PosterEdit.unchanged());
        assertThat(edited.revision()).isEqualTo(2);
        assertThatThrownBy(first::withdraw).hasMessage("error.event-content.revision-not-submitted");
    }

    @Test
    void decisionsAreStaleCheckedIdempotentAndNeedAReasonToRefuse() {
        var submitted = EventContentRevision.start(event, 0, content("a"), PosterEdit.unchanged())
                .submit(UUID.randomUUID(), now);
        UUID reviewer = UUID.randomUUID();
        assertThatThrownBy(() -> submitted.decide(Action.APPROVE, reviewer, null, 9, now))
                .hasMessage("error.performance.version-conflict");
        assertThatThrownBy(() -> submitted.decide(Action.REJECT, reviewer, "  ", 1, now))
                .hasMessage("error.event-content.reason-required");
        var approved = submitted.decide(Action.APPROVE, reviewer, null, 1, now);
        assertThat(approved.repeated()).isFalse();
        assertThat(approved.revision().state()).isEqualTo(State.APPROVED);
        assertThat(approved.revision().reviewerId()).isEqualTo(reviewer);
        assertThat(approved.revision().decide(Action.APPROVE, reviewer, null, 1, now).repeated()).isTrue();
        assertThatThrownBy(() -> approved.revision().decide(Action.REJECT, reviewer, "late", 1, now))
                .hasMessage("error.event-content.revision-not-submitted");
    }
}
