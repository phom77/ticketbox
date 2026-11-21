package org.ticketbox.ticketing.order.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.ticketing.domain.BaseEntity;

import java.math.BigDecimal;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class OrderItem extends BaseEntity {

    private UUID orderId;

    private UUID ticketTypeId;

    private int quantity;

    private BigDecimal unitPrice;

    private BigDecimal subtotal;

    private UUID groupId;
    private UUID seatId;
    private String offerName;
    private String sectionLabel;
    private String rowLabel;
    private String seatLabel;

    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }

    public void setTicketTypeId(UUID ticketTypeId) {
        this.ticketTypeId = ticketTypeId;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }

    public static OrderItem pricedPerformance(UUID offerId, UUID groupId, UUID seatId, int quantity,
                                              BigDecimal unitPrice, String offerName, String sectionLabel,
                                              String rowLabel, String seatLabel) {
        OrderItem line = priced(offerId, quantity, unitPrice);
        line.groupId = java.util.Objects.requireNonNull(groupId);
        line.seatId = seatId;
        line.offerName = java.util.Objects.requireNonNull(offerName);
        line.sectionLabel = java.util.Objects.requireNonNull(sectionLabel);
        line.rowLabel = rowLabel;
        line.seatLabel = seatLabel;
        return line;
    }

    public static OrderItem priced(UUID ticketTypeId, int quantity, BigDecimal unitPrice) {
        Money price = new Money(unitPrice);
        OrderItem line = new OrderItem();
        line.ticketTypeId = java.util.Objects.requireNonNull(ticketTypeId);
        line.quantity = quantity;
        line.unitPrice = price.amount();
        line.subtotal = price.multiply(quantity).amount();
        return line;
    }
}
