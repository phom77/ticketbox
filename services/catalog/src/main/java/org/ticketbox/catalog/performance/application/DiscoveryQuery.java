package org.ticketbox.catalog.performance.application;

import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;

public record DiscoveryQuery(String words, OffsetDateTime now, OffsetDateTime startsFrom,
                             OffsetDateTime startsBefore, SaleStatus status, boolean saleStartFirst) {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

    public enum DatePreset { ANY, TODAY, WEEKEND, NEXT_30, CUSTOM }

    public enum SaleStatus { ON_SALE, UPCOMING, SOLD_OUT, CLOSED }

    public static DiscoveryQuery of(String query, DatePreset preset, LocalDate from, LocalDate to,
                                    SaleStatus status, boolean saleStartFirst) {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        var today = now.atZoneSameInstant(VIETNAM).toLocalDate();
        switch (preset) {
            case TODAY -> {
                from = today;
                to = today;
            }
            case WEEKEND -> {
                from = today.getDayOfWeek() == DayOfWeek.SUNDAY ? today.minusDays(1)
                        : today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
                to = from.plusDays(1);
            }
            case NEXT_30 -> {
                from = today;
                to = today.plusDays(29);
            }
            default -> { }
        }
        var startsFrom = atMidnight(from);
        var startsBefore = to == null ? null : atMidnight(to.plusDays(1));
        if (startsFrom == null && startsBefore == null && query.isEmpty() && status == null) startsFrom = now;
        var words = Normalizer.normalize(query, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT).replace('\u0111', 'd').replaceAll("(?U)\\s+", " ").strip();
        return new DiscoveryQuery(words, now, startsFrom, startsBefore, status, saleStartFirst);
    }

    private static OffsetDateTime atMidnight(LocalDate date) {
        return date == null ? null : date.atStartOfDay(VIETNAM).toOffsetDateTime();
    }
}
