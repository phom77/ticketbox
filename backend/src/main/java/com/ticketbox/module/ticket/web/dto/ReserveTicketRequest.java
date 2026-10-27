package com.ticketbox.module.ticket.web.dto;

import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReserveTicketRequest {
    @Min(value = 1, message = "Số lượng phải ít nhất là 1")
    private int quantity = 1;
}
