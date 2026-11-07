package org.ticketbox.ticketing.inventory.hold.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import org.ticketbox.ticketing.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@NoArgsConstructor
@Getter
@Setter
public class TicketHold extends BaseEntity {

    private UUID concertId;

    private UUID userId;

    private UUID ticketTypeId;

    private Integer quantity;

    private OffsetDateTime expiresAt;

    private String sessionToken;
}
