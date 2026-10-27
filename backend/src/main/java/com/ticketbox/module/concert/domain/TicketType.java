package com.ticketbox.module.concert.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "ticket_types")
@Getter
@NoArgsConstructor
public class TicketType extends BaseEntity {

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "price", nullable = false, precision = 12, scale = 0)
    private BigDecimal price;

    @Column(name = "total_quantity", nullable = false)
    private int totalQuantity;

    @Column(name = "available_qty", nullable = false, updatable = false)
    private int availableQty;

    @Column(name = "max_per_account", nullable = false)
    private int maxPerAccount = 4;

    @Column(name = "zone_color", length = 7)
    private String zoneColor;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public void setTotalQuantity(int totalQuantity) {
        this.totalQuantity = totalQuantity;
    }

    public void setAvailableQty(int availableQty) {
        this.availableQty = availableQty;
    }

    public void setMaxPerAccount(int maxPerAccount) {
        this.maxPerAccount = maxPerAccount;
    }

    public void setZoneColor(String zoneColor) {
        this.zoneColor = zoneColor;
    }

    public void setActive(boolean active) {
        isActive = active;
    }
}
