package org.ticketbox.catalog.concert.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.catalog.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class Concert extends BaseEntity {

    public enum Status {
        DRAFT,
        ON_SALE,
        SOLD_OUT,
        CANCELLED,
        COMPLETED
    }

    private String title;

    private String description;

    private String artistBio;

    private String venueName;

    private String venueAddress;

    private OffsetDateTime eventDate;

    private OffsetDateTime doorsOpenAt;

    private OffsetDateTime saleStartAt;

    private OffsetDateTime saleEndAt;

    private Status status = Status.DRAFT;

    private String seatMapSvg;

    private String posterUrl;

    private String posterPublicId;

    private boolean publicVisible = true;

    private UUID createdBy;

    private UUID organizationId;

    public void setTitle(String title) {
        this.title = title;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setArtistBio(String artistBio) {
        this.artistBio = artistBio;
    }

    public void setVenueName(String venueName) {
        this.venueName = venueName;
    }

    public void setVenueAddress(String venueAddress) {
        this.venueAddress = venueAddress;
    }

    public void setEventDate(OffsetDateTime eventDate) {
        this.eventDate = eventDate;
    }

    public void setDoorsOpenAt(OffsetDateTime doorsOpenAt) {
        this.doorsOpenAt = doorsOpenAt;
    }

    public void setSaleStartAt(OffsetDateTime saleStartAt) {
        this.saleStartAt = saleStartAt;
    }

    public void setSaleEndAt(OffsetDateTime saleEndAt) {
        this.saleEndAt = saleEndAt;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public void setSeatMapSvg(String seatMapSvg) {
        this.seatMapSvg = seatMapSvg;
    }

    public void setPosterUrl(String posterUrl) {
        this.posterUrl = posterUrl;
    }

    public void setPosterPublicId(String posterPublicId) {
        this.posterPublicId = posterPublicId;
    }

    public void setPublicVisible(boolean publicVisible) {
        this.publicVisible = publicVisible;
    }

    public void setCreatedBy(UUID createdBy) {
        this.createdBy = createdBy;
    }

    public void assignOrganization(UUID organizationId) {
        if (this.organizationId != null) {
            throw new IllegalStateException("The concert already has an organization");
        }
        this.organizationId = java.util.Objects.requireNonNull(organizationId);
    }

    private static final java.util.Map<Concert.Status, java.util.Set<Concert.Status>>
            VALID_TRANSITIONS =
                    java.util.Map.of(
                            Concert.Status.DRAFT,
                                    java.util.Set.of(
                                            Concert.Status.ON_SALE, Concert.Status.CANCELLED),
                            Concert.Status.ON_SALE,
                                    java.util.Set.of(
                                            Concert.Status.SOLD_OUT,
                                            Concert.Status.CANCELLED,
                                            Concert.Status.COMPLETED),
                            Concert.Status.SOLD_OUT,
                                    java.util.Set.of(
                                            Concert.Status.ON_SALE,
                                            Concert.Status.CANCELLED,
                                            Concert.Status.COMPLETED));

    public void changeStatus(Status newStatus) {
        Status currentStatus = status;
        if (currentStatus == newStatus) {
            return;
        }
        java.util.Set<Concert.Status> allowed = VALID_TRANSITIONS.get(currentStatus);
        if (allowed == null || !allowed.contains(newStatus)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_STATUS_TRANSITION",
                    "error.concert.transition-not-allowed",
                    currentStatus,
                    newStatus);
        }
        status = newStatus;
    }
}
