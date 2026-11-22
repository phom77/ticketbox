package org.ticketbox.catalog.concert.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ticketbox.catalog.concert.application.dto.UpdateConcertRequest;

public interface ConcertPublicationStore {
    enum State { SUBMITTED, CHANGES_REQUESTED, REJECTED, SCHEDULED, RELEASED, HELD, MISSED, SUPERSEDED }

    record PosterEdit(String url, String publicId) {}

    record StagedEdit(UpdateConcertRequest details, PosterEdit poster, String artistBio) {}

    record Review(UUID id, UUID concertId, String title, State state, OffsetDateTime publishAt,
                  OffsetDateTime saleStartAt, String reason, UUID reviewerId, OffsetDateTime decidedAt,
                  StagedEdit proposedEdit, boolean resumeHold) {}

    Optional<Review> current(UUID concertId);

    List<Review> queue();

    List<UUID> due(OffsetDateTime now);

    boolean matches(UUID reviewId);

    boolean releasedBefore(UUID concertId);

    Optional<StagedEdit> stagedEdit(UUID concertId);

    void stageEdit(UUID concertId, StagedEdit edit);

    void clearStagedEdit(UUID concertId);

    void submit(UUID id, UUID concertId, UUID actor, OffsetDateTime publishAt, boolean resumeHold);

    void decide(UUID id, State state, UUID reviewer, String reason);

    void hold(UUID id, UUID actor, String reason);

    void recordActivation(UUID concertId);

    void transition(UUID id, State state);
}
