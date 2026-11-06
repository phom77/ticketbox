package org.ticketbox.ticketing.reporting;

import java.math.BigDecimal;

public record SalesTrendView(
    String date,
    long ticketsSold,
    BigDecimal revenue
) {}
