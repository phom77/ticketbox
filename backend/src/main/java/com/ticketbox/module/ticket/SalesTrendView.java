package com.ticketbox.module.ticket;

import java.math.BigDecimal;

public record SalesTrendView(
    String date,
    long ticketsSold,
    BigDecimal revenue
) {}
