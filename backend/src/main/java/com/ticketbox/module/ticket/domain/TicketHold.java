package com.ticketbox.module.ticket.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "ticket_holds")
@NoArgsConstructor
@Getter
@Setter
public class TicketHold extends BaseEntity {

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "ticket_type_id", nullable = false)
    private UUID ticketTypeId;

    @Column(name = "quantity", nullable = false)
    private Integer quantity;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "session_token")
    private String sessionToken;
}
