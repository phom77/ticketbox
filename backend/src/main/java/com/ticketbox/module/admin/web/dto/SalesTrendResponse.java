package com.ticketbox.module.admin.web.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SalesTrendResponse(
        LocalDate date,
        long ticketsSold,
        BigDecimal revenue) {
}
