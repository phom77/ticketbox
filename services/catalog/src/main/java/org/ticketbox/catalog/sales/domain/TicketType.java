package org.ticketbox.catalog.sales.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.catalog.domain.BaseEntity;

import java.math.BigDecimal;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class TicketType extends BaseEntity {

    private UUID concertId;

    private String name;

    private BigDecimal price;

    private int totalQuantity;

    private int availableQty;

    private int maxPerAccount = 4;

    private String zoneColor;

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
