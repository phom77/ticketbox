package org.ticketbox.catalog.concert.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

@Entity
@Immutable
@Table(name = "sale_config_outbox")
class CatalogSalePublication {
    @Id
    @Column(name = "concert_id")
    private UUID concertId;
    private long version;
    @Column(name = "activation_version")
    private Long activationVersion;
    @Column(name = "ticketing_version")
    private long ticketingVersion;
    @Column(name = "checkin_version")
    private long checkinVersion;

    protected CatalogSalePublication() {}
}
