package org.ticketbox.catalog.domain;

import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
public abstract class BaseEntity {

    @Setter private UUID id;

    private OffsetDateTime createdAt;

    private OffsetDateTime updatedAt;

    protected void initializeTimestamps() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    protected void updateTimestamp() {
        updatedAt = OffsetDateTime.now();
    }
}
