package org.ticketbox.ticketing.reporting.application.port;

import java.math.BigDecimal;

public record SalesTrendView(String date, long ticketsSold, BigDecimal revenue) {}
