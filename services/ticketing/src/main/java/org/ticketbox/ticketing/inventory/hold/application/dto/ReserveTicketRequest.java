package org.ticketbox.ticketing.inventory.hold.application.dto;

import jakarta.validation.constraints.Min;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReserveTicketRequest {
    @Min(value = 1, message = "{validation.quantity.min}")
    private int quantity = 1;
}
